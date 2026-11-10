// One JSON request per Python process; stdout is reserved for the response.
export const pythonWorker = `import contextlib, importlib, importlib.util, json, os, sys
stage = 'request'
request = {}
index = None
try:
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        if request.get('mode') == 'info':
            result = {'version': sys.version.split()[0], 'executable': sys.executable, 'prefix': sys.prefix, 'basePrefix': sys.base_prefix, 'virtualenv': sys.prefix != sys.base_prefix}
        else:
            module_name = request['module']
            stage = 'import'
            if module_name.endswith('.py') or os.path.isabs(module_name):
                if not os.path.isfile(module_name):
                    stage = 'file'
                    raise FileNotFoundError('Cannot find Python file: ' + module_name)
                spec = importlib.util.spec_from_file_location('_arya_bridge', module_name)
                if spec is None or spec.loader is None:
                    raise ImportError('Cannot load Python file: ' + module_name)
                module = importlib.util.module_from_spec(spec)
                sys.path.insert(0, os.path.dirname(os.path.abspath(module_name)))
                spec.loader.exec_module(module)
            else:
                module = importlib.import_module(module_name)
            stage = 'member'
            target = module
            for part in request['member']:
                if part.startswith('_'):
                    raise ValueError('Python bridge members must be public')
                target = getattr(target, part)
            if not callable(target):
                raise TypeError('Python bridge target must be a public callable')
            def invoke(arguments):
                value = target(*arguments, **request.get('kwargs', {}))
                if request.get('async'):
                    import asyncio, inspect
                    if inspect.isawaitable(value):
                        async def wait_for_result():
                            return await value
                        value = asyncio.run(wait_for_result())
                return value
            stage = 'call'
            if request.get('mode') == 'map':
                result = []
                for index, value in enumerate(request['values']):
                    stage = 'call'
                    item = invoke([value])
                    stage = 'return'
                    json.dumps(item, allow_nan=False)
                    result.append(item)
                index = None
            else:
                result = invoke(request['args'])
    stage = 'return'
    response = json.dumps({'ok': True, 'value': result}, allow_nan=False)
except Exception as error:
    code = 'ARYA_PYTHON_EXCEPTION'
    if stage == 'file':
        code = 'ARYA_PYTHON_FILE_NOT_FOUND'
    elif stage == 'import' and isinstance(error, ModuleNotFoundError):
        code = 'ARYA_PYTHON_MODULE_NOT_FOUND'
    elif stage == 'member':
        code = 'ARYA_PYTHON_MEMBER'
    elif stage == 'return':
        code = 'ARYA_PYTHON_RETURN'
    failure = {'ok': False, 'code': code, 'error': type(error).__name__ + ': ' + str(error)}
    if request.get('async'):
        import traceback
        failure['type'] = type(error).__name__
        failure['traceback'] = traceback.format_exc()[-65536:]
        if index is not None:
            failure['index'] = index
    response = json.dumps(failure)
sys.stdout.write(response)
`;
