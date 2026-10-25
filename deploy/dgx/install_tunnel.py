#!/usr/bin/env python3
"""Operator-only installer. Does not change the management SSH daemon."""
import argparse
import ipaddress
import os
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--tailscale-ip', required=True)
p.add_argument('--app-port', type=int, default=18081)
a = p.parse_args()
if os.geteuid() != 0:
    raise SystemExit('Run as root on the device.')
address = ipaddress.ip_address(a.tailscale_ip)
if address.version != 4 or address not in ipaddress.ip_network('100.64.0.0/10'):
    raise SystemExit('Use this device\'s Tailscale IPv4 address.')
if not 1024 <= a.app_port <= 65535:
    raise SystemExit('Invalid application port.')
here = Path(__file__).resolve().parent
Path('/etc/coair').mkdir(mode=0o755, exist_ok=True)
Path('/etc/coair').chmod(0o755)
Path('/usr/local/lib/coair').mkdir(mode=0o755, exist_ok=True)
for name, target, mode in [
    ('tunnel_accounts.py', '/usr/local/lib/coair/tunnel_accounts.py', 0o755),
    ('coair-tunnel.service', '/etc/systemd/system/coair-tunnel.service', 0o644),
    ('coair-tunnel-expire.service', '/etc/systemd/system/coair-tunnel-expire.service', 0o644),
    ('coair-tunnel-expire.timer', '/etc/systemd/system/coair-tunnel-expire.timer', 0o644),
]:
    destination = Path(target)
    destination.write_bytes((here / name).read_bytes())
    destination.chmod(mode)
config = (here / 'sshd-tunnel.conf.template').read_text().replace('${TAILSCALE_IP}', str(address)).replace('${APP_PORT}', str(a.app_port))
Path('/etc/ssh/sshd_config_coair_tunnel').write_text(config)
Path('/etc/ssh/sshd_config_coair_tunnel').chmod(0o600)
subprocess.run(['/usr/sbin/sshd', '-t', '-f', '/etc/ssh/sshd_config_coair_tunnel'], check=True)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'coair-tunnel.service', 'coair-tunnel-expire.timer'], check=True)
subprocess.run(['ssh-keygen', '-lf', '/etc/ssh/ssh_host_ed25519_key.pub'], check=True)
print(f'Tunnel-only listener ready on {address}:2222, sole destination 127.0.0.1:{a.app_port}. No user was granted access.')
