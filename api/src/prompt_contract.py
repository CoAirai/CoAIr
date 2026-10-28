"""Version-independent fingerprints for reviewed prompt expressions."""
import ast
import hashlib
import json


def signature(expression):
    def canonical(value):
        if isinstance(value, ast.AST):
            return {'node': type(value).__name__,
                    'fields': {key: canonical(v) for key, v in ast.iter_fields(value)}}
        if isinstance(value, list):
            return [canonical(v) for v in value]
        return value
    return hashlib.sha256(json.dumps(canonical(expression), sort_keys=True,
                                     ensure_ascii=False).encode()).hexdigest()
