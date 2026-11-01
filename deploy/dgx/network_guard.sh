#!/usr/bin/env bash
# Operator-only device ingress guard. Docker DNAT is covered in DOCKER-USER.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
action=${1:-apply}
for tool in iptables ip6tables; do
  if [[ $action == remove ]]; then
    "$tool" -D INPUT -j COAIR-INGRESS 2>/dev/null || true
    "$tool" -D DOCKER-USER -j COAIR-FORWARD 2>/dev/null || true
    "$tool" -D FORWARD -j COAIR-FORWARD 2>/dev/null || true
    for chain in COAIR-INGRESS COAIR-FORWARD; do
      "$tool" -F "$chain" 2>/dev/null || true
      "$tool" -X "$chain" 2>/dev/null || true
    done
    continue
  fi
  for chain in COAIR-INGRESS COAIR-FORWARD; do
    "$tool" -N "$chain" 2>/dev/null || true
    "$tool" -F "$chain"
    "$tool" -A "$chain" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
    "$tool" -A "$chain" -i lo -j RETURN
    while read -r address; do
      [[ -z $address || $address == \#* ]] && continue
      if [[ $tool == iptables && $address != *:* ]] || [[ $tool == ip6tables && $address == *:* ]]; then
        "$tool" -A "$chain" -i tailscale0 -s "$address" -j RETURN
      fi
    done < /etc/coair/network-operators
  done
  # The private model is on the host; only operator-controlled Docker workers
  # may reach it through a bridge. Customer SSH forwarding cannot target it.
  "$tool" -A COAIR-INGRESS -i 'br+' -p tcp --dport 8000 -j RETURN
  "$tool" -A COAIR-INGRESS -i 'docker+' -p tcp --dport 8000 -j RETURN
  "$tool" -A COAIR-INGRESS -p tcp -m multiport --dports 443,2222 -j RETURN
  "$tool" -A COAIR-INGRESS -p tcp -j REJECT --reject-with tcp-reset
  "$tool" -A COAIR-INGRESS -j RETURN
  "$tool" -A COAIR-FORWARD -i 'br+' -j RETURN
  "$tool" -A COAIR-FORWARD -i 'docker+' -j RETURN
  # Office HTTPS is DNATed by Docker; allow only that published service.
  "$tool" -A COAIR-FORWARD -p tcp --dport 443 -j RETURN
  "$tool" -A COAIR-FORWARD -p tcp -j REJECT --reject-with tcp-reset
  "$tool" -A COAIR-FORWARD -j RETURN
  "$tool" -C INPUT -j COAIR-INGRESS 2>/dev/null || "$tool" -I INPUT 1 -j COAIR-INGRESS
  if "$tool" -S DOCKER-USER >/dev/null 2>&1; then
    "$tool" -C DOCKER-USER -j COAIR-FORWARD 2>/dev/null || "$tool" -I DOCKER-USER 1 -j COAIR-FORWARD
  else
    "$tool" -C FORWARD -j COAIR-FORWARD 2>/dev/null || "$tool" -I FORWARD 1 -j COAIR-FORWARD
  fi
done
