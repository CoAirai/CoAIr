"""Validate endpoint contracts; optionally probe them without changing resources."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import ipaddress
import json
import socket
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate(config):
    if not isinstance(config, dict) or type(config.get('stateful_api_replicas')) is not int or config['stateful_api_replicas'] != 1:
        raise ValueError('Exactly one authoritative stateful API is supported')
    endpoints = config.get('endpoints')
    if not isinstance(endpoints, list) or not endpoints:
        raise ValueError('At least one endpoint is required')
    names = set()
    for item in endpoints:
        if not isinstance(item, dict):
            raise ValueError('Each endpoint must be an object')
        name = item.get('name')
        if not isinstance(name, str) or not name or name in names:
            raise ValueError('Endpoint names must be unique nonempty strings')
        names.add(name)
        url = urllib.parse.urlsplit(item.get('url', ''))
        if url.scheme not in ('http', 'https', 'tcp') or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError(f'{name}: use an endpoint URL without credentials, query or fragment')
        port = url.port or {'http': 80, 'https': 443}.get(url.scheme)
        if type(item.get('expected_port')) is not int or not port or port != item['expected_port']:
            raise ValueError(f'{name}: URL port does not match expected_port')
        if item.get('check') not in ('api_health', 'web', 'toolkit_health', 'tcp'):
            raise ValueError(f'{name}: unsupported endpoint check')
        if (url.scheme == 'tcp') != (item['check'] == 'tcp'):
            raise ValueError(f'{name}: TCP probes require tcp:// and check=tcp')
        if item.get('scope') not in ('local', 'cross_host'):
            raise ValueError(f'{name}: scope must be local or cross_host')
        if item.get('scope') == 'cross_host':
            if url.hostname == 'localhost' or '.' not in url.hostname:
                raise ValueError(f'{name}: cross-host endpoints require a private IP or qualified DNS name')
            try:
                address = ipaddress.ip_address(url.hostname)
            except ValueError:
                address = None
            if address and (address.is_loopback or address.is_unspecified):
                raise ValueError(f'{name}: cross-host endpoint cannot be loopback/unspecified')
    return endpoints


def probe(item, timeout=5):
    url = urllib.parse.urlsplit(item['url'])
    port = url.port or (443 if url.scheme == 'https' else 80)
    result = {'name': item['name'], 'host': url.hostname, 'port': port, 'ok': False}
    try:
        if item.get('scope') == 'cross_host':
            addresses = {ipaddress.ip_address(row[4][0]) for row in socket.getaddrinfo(url.hostname, port, type=socket.SOCK_STREAM)}
            if not addresses or any(a.is_loopback or a.is_unspecified for a in addresses):
                raise ValueError('cross_host_dns_resolves_to_loopback')
        if item['check'] == 'tcp':
            with socket.create_connection((url.hostname, port), timeout=timeout):
                pass
        else:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open(item['url'], timeout=timeout) as response:
                if response.status != 200:
                    raise ValueError('unexpected_http_status')
                if item['check'] == 'api_health':
                    data = json.loads(response.read(65537))
                    if data.get('status') not in ('healthy', 'ok'):
                        raise ValueError('api_not_ready')
                elif item['check'] == 'toolkit_health':
                    if response.read(64).strip() != b'ok':
                        raise ValueError('toolkit_not_ready')
                elif 'text/html' not in response.headers.get('Content-Type', ''):
                    raise ValueError('unexpected_web_content_type')
        result['ok'] = True
    except (OSError, ValueError, urllib.error.HTTPError) as exc:
        result['error'] = type(exc).__name__
        if isinstance(exc, urllib.error.HTTPError):
            result['http_status'] = exc.code
            exc.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config')
    parser.add_argument('--connect', action='store_true')
    args = parser.parse_args()
    try:
        with open(args.config) as stream:
            endpoints = validate(json.load(stream))
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(probe, endpoints)) if args.connect else []
        ready = args.connect and all(r['ok'] for r in results)
        print(json.dumps({'configuration_valid': True, 'network_checked': args.connect,
                          'connectivity_ready': ready, 'endpoints': results}))
        return 0 if not args.connect or ready else 1
    except (OSError, ValueError) as exc:
        print(json.dumps({'configuration_valid': False, 'error': str(exc)}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
