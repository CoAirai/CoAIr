"""Optional process-lifetime ownership for the single stateful API host.

This protects the existing file stores and embedded queues. It does not turn
SQLite/DuckDB into a distributed database. Stateless web hosts may scale freely.
"""
import atexit
import os
from pathlib import Path
import threading

_owners = {}
_guard = threading.Lock()


def validate_topology(env):
    if env.get('COAIR_ENFORCE_STATE_OWNER', '').lower() not in ('true', '1', 'yes'):
        return False
    for name in ('COAIR_STATEFUL_API_REPLICAS', 'WEB_CONCURRENCY'):
        try:
            count = int(env.get(name, '1'))
        except ValueError:
            raise RuntimeError(f'{name} must be 1 for the file-backed API') from None
        if count != 1:
            raise RuntimeError(f'{name} must be 1; shared queues and file stores are not replica-safe')
    if env.get('COAIR_WORKER_MODE', 'embedded') != 'embedded':
        raise RuntimeError('Only embedded workers are qualified for this deployment')
    return True


def acquire_state_owner(storage_dir, env=None):
    env = os.environ if env is None else env
    if not validate_topology(env):
        return
    import fcntl
    directory = Path(storage_dir).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / '.state-owner.lock'
    with _guard:
        existing = _owners.get(str(path))
        if existing and existing[0] == os.getpid():
            return
        if existing:
            os.close(existing[1])  # A fork must acquire its own ownership.
            del _owners[str(path)]
        fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise RuntimeError('Another API process owns this storage; refusing queue recovery/startup') from None
        except OSError:
            os.close(fd)
            raise RuntimeError('Storage must support exclusive local file locks') from None
        _owners[str(path)] = (os.getpid(), fd)
        # Keep the lock until process exit: a slow model call can outlive the
        # lifespan shutdown grace period and still complete a job.


def _close_owners():
    for _, fd in list(_owners.values()):
        try:
            os.close(fd)
        except OSError:
            pass
    _owners.clear()


atexit.register(_close_owners)
