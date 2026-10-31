// Classic worker: MediaPipe's Wasm loader uses importScripts internally.
// Frames are transferred locally as ImageBitmap; no network upload occurs.
let landmarker;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const {FilesetResolver, HandLandmarker} = await import('./vendor/mediapipe/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', self.location.href).href);
      const options = {
        baseOptions: {modelAssetPath:new URL('./models/hand_landmarker.task',self.location.href).href, delegate:'GPU'},
        runningMode:'VIDEO', numHands:2, minHandDetectionConfidence:.6,
        minHandPresenceConfidence:.6, minTrackingConfidence:.6,
        canvas:new OffscreenCanvas(640,480)
      };
      try { landmarker = await HandLandmarker.createFromOptions(vision, options); }
      catch (_) {
        options.baseOptions.delegate = 'CPU'; delete options.canvas;
        landmarker = await HandLandmarker.createFromOptions(vision, options);
      }
      self.postMessage({type:'ready'});
    } catch (error) { self.postMessage({type:'error',message:String(error?.message || error)}); }
  } else if (data.type === 'frame') {
    try {
      const result = landmarker.detectForVideo(data.frame, data.timestamp);
      self.postMessage({type:'result',landmarks:result.landmarks,timestamp:data.timestamp});
    } catch (error) { self.postMessage({type:'error',message:String(error?.message || error)}); }
    finally { data.frame?.close(); }
  }
};
