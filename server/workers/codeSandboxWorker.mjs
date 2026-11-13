import vm from 'node:vm';

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_CODE_BYTES = 64 * 1024;

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES + MAX_CODE_BYTES + 16 * 1024) {
      throw new Error('Code Node input exceeds the 1 MB limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function writeResponse(payload, exitCode = 0) {
  process.stdout.write(JSON.stringify(payload));
  process.exitCode = exitCode;
}

try {
  const request = JSON.parse(await readStdin());
  if (typeof request.code !== 'string' || Buffer.byteLength(request.code, 'utf8') > MAX_CODE_BYTES) {
    throw new Error('Code Node snippet is invalid or exceeds the 64 KB limit.');
  }

  const inputJson = JSON.stringify(request.inputs ?? {});
  if (Buffer.byteLength(inputJson, 'utf8') > MAX_INPUT_BYTES) {
    throw new Error('Code Node input data exceeds the 1 MB limit.');
  }

  const scriptSource = `
    const __croxInput = JSON.parse(${JSON.stringify(inputJson)});
    for (const __key of Object.keys(__croxInput)) {
      Object.defineProperty(globalThis, __key, {
        value: __croxInput[__key], enumerable: true, configurable: true, writable: true
      });
    }
    const __croxResult = (function () {
      "use strict";
      ${request.code}\n
    })();
    JSON.stringify(typeof __croxResult === 'undefined' ? null : __croxResult);
  `;

  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  });
  const serialized = new vm.Script(scriptSource, { filename: 'crox-code-node.vm.js' }).runInContext(context, {
    timeout: Math.min(Math.max(Number(request.timeoutMs) || 1000, 100), 2500),
  });

  if (typeof serialized !== 'string') {
    throw new Error('Code Node output is not JSON-serializable.');
  }
  const response = JSON.stringify({ ok: true, result: JSON.parse(serialized) });
  if (Buffer.byteLength(response, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new Error('Code Node output exceeds the 1 MB limit.');
  }
  process.stdout.write(response);
} catch (error) {
  writeResponse({
    ok: false,
    error: error instanceof Error ? error.message : 'Code Node execution failed.',
  }, 1);
}
