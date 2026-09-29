"""Executed only in a disposable build container."""
from setuptools import Extension, setup
from Cython.Build import cythonize

modules = ['coair_protected', 'src.chronology_dates', 'src.chronology_prompts', 'src.json_repair', 'src.local_metadata']
extensions = [Extension(name, [name.replace('.', '/') + '.py'], extra_compile_args=['-O2', '-g0']) for name in modules]
setup(name='coair-protected', ext_modules=cythonize(extensions, nthreads=4,
    compiler_directives={'language_level': 3, 'annotation_typing': False,
                         'binding': True, 'emit_code_comments': False}),
    script_args=['build_ext', '--inplace', '-j', '4'])
