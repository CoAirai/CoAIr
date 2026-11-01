#!/usr/bin/env bash
# Developer-side pilot builder; requires Python cryptography and SSH access.
# BASE_IMAGE must already contain the intended, tested application release.
set -euo pipefail
host=${1:?Usage: build.sh user@dgx release}
release=${2:?Usage: build.sh user@dgx release}
base=${BASE_IMAGE:-coair-api:dgx-local}
[[ "$host" =~ ^[a-zA-Z0-9@._:-]+$ && "$release" =~ ^[a-zA-Z0-9._-]+$ && "$base" =~ ^[a-zA-Z0-9/:._-]+$ ]] || exit 2
here=$(cd "$(dirname "$0")" && pwd)
python=${PROTECTION_PYTHON:-python3}
secrets=${COAIR_SIGNING_HOME:-$HOME/.coair-release-secrets/dgx-pilot}
identity=${DGX_SSH_KEY:-$HOME/.ssh/dgx_spark}
builder=${COAIR_PROTECTION_BUILDER:-default}
[[ "$builder" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
ssh_args=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -i "$identity")
remote="/home/coair/protection-build/$release"
rebuild=${COAIR_REBUILD_RELEASE:-0}
[[ "$rebuild" == 0 || "$rebuild" == 1 ]] || exit 2
ssh "${ssh_args[@]}" "$host" "set -e
 (test ! -e '$remote/complete' || test '$rebuild' = 1)
 mkdir -p '$remote/tools'
 if test -d '$remote/app'; then docker run --rm -v '$remote/app:/staging' '$base' chown -R \"\$(id -u):\$(id -g)\" /staging; fi
 rm -f '$remote/complete'
 rm -rf '$remote/app'
 mkdir '$remote/app'
 cat /etc/machine-id" > "$work/machine-id"
"$python" "$here/provision.py" --secrets "$secrets" --identity-file "$work/machine-id" --runtime-output "$work/coair_protected.py"
scp -i "$identity" "$here/Dockerfile.compiler" "$here/compile.py" "$work/coair_protected.py" "$here/../../../api/src/chronology_prompts.py" "$host:$remote/tools/"
ssh "${ssh_args[@]}" "$host" "set -e
 docker create --name 'coair-protected-stage-$release' '$base' python -c pass > /dev/null
 docker cp 'coair-protected-stage-$release:/app/.' '$remote/app/'
 docker rm 'coair-protected-stage-$release' > /dev/null
 cp '$remote/tools/coair_protected.py' '$remote/tools/compile.py' '$remote/app/'
 cp '$remote/tools/chronology_prompts.py' '$remote/app/src/'
 docker run --rm --entrypoint sh -v '$remote/app:/build' '$base' -c 'apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && pip install --no-cache-dir Cython==3.0.12 setuptools==75.8.0 && cd /build && python compile.py' > '$remote/compile.log' 2>&1
 docker run --rm -v '$remote/app:/staging' '$base' chown -R \"\$(id -u):\$(id -g)\" /staging
 tar -C '$remote' -czf '$remote/compiled-app.tgz' app"
scp -i "$identity" "$host:$remote/compiled-app.tgz" "$work/compiled-app.tgz"
tar -xzf "$work/compiled-app.tgz" -C "$work"
"$python" "$here/pack.py" --root "$work/app" --secrets "$secrets" --release "$release"
cp "$here/Dockerfile.runtime" "$work/Dockerfile"
COPYFILE_DISABLE=1 tar --format=ustar -C "$work" -czf "$work/runtime.tgz" app Dockerfile
scp -i "$identity" "$work/runtime.tgz" "$host:$remote/runtime.tgz"
ssh "${ssh_args[@]}" "$host" "set -e
 mkdir -p '$remote/runtime'
 tar -xzf '$remote/runtime.tgz' -C '$remote/runtime'
 mkdir -p '$remote/runtime/rootfs'
 docker create --name 'coair-flat-stage-$release' '$base' python -c pass > /dev/null
 docker export 'coair-flat-stage-$release' | tar -xf - -C '$remote/runtime/rootfs'
 docker rm 'coair-flat-stage-$release' > /dev/null
 python3 -c \"import shutil; from pathlib import Path; root=Path('$remote/runtime'); shutil.rmtree(root/'rootfs/app'); shutil.move(str(root/'app'), str(root/'rootfs/app'))\"
 docker buildx build --builder '$builder' --load -t 'coair-api:protected-$release' '$remote/runtime' > '$remote/runtime-build.log' 2>&1
 touch '$remote/complete'"
echo "Built coair-api:protected-$release. No running service was changed. Signing key stayed on this machine."
echo 'Run protected checks and negative tests before tagging dgx-protected-pilot and enabling.'
