// Based on the public Transformers.js Chatterbox demo by Resemble AI.
// Intentionally isolated from production voice and chat.
import { ChatterboxModel, AutoProcessor, Tensor } from '@huggingface/transformers';

const MODEL = 'onnx-community/chatterbox-ONNX';
let model, processor, speaker;
async function checkGpu() {
  if (!navigator.gpu) return false;
  try { return Boolean(await navigator.gpu.requestAdapter()); } catch { return false; }
}
self.addEventListener('message', async event => {
  const { id, type, data } = event.data;
  try {
    if (type === 'capability') {
      self.postMessage({ id, type: 'done', data: { gpu: await checkGpu() } });
    } else if (type === 'load') {
      const gpu = await checkGpu();
      if (!gpu) throw new Error('WebGPU is unavailable on this browser. This large experimental model is not safe to download without GPU support. Please use a modern Safari or desktop browser.');
      processor = await AutoProcessor.from_pretrained(MODEL);
      model = await ChatterboxModel.from_pretrained(MODEL, {
        device: 'webgpu',
        dtype: {
          embed_tokens: 'fp32',
          speech_encoder: 'fp32',
          language_model: 'q4f16',
          conditional_decoder: 'fp32'
        },
        progress_callback: progress => self.postMessage({ id, type: 'progress', data: progress })
      });
      self.postMessage({ id, type: 'done', data: { gpu } });
    } else if (type === 'clone') {
      if (!model) throw new Error('Model not loaded.');
      const samples = new Float32Array(data);
      const tensor = new Tensor('float32', samples, [1, samples.length]);
      speaker = await model.encode_speech(tensor);
      self.postMessage({ id, type: 'done' });
    } else if (type === 'generate') {
      if (!model || !speaker) throw new Error('Voice is not ready.');
      const tokens = await processor._call(String(data.text).slice(0, 100));
      const waveform = await model.generate({
        ...tokens, ...speaker, exaggeration: 0.40, max_new_tokens: 320
      });
      const pcm = new Float32Array(waveform.data);
      if (!pcm.length) throw new Error('No speech was produced.');
      self.postMessage({ id, type: 'done', data: pcm.buffer }, [pcm.buffer]);
    } else {
      throw new Error('Unknown voice operation.');
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error?.message || error).slice(0, 700) });
  }
});
