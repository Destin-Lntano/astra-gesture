import {OneEuroFilter} from './one-euro.js';

const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

// Ratios normalize to hand size, so moving the hand nearer does not trigger a pinch.
export function classifyHand(lm) {
  if (!lm || lm.length < 21) return null;
  const scale = Math.max(distance(lm[0],lm[9]), .015);
  const extended = [8,12,16,20].map((tip) => distance(lm[tip],lm[0]) > distance(lm[tip-2],lm[0])*1.17);
  const count = extended.filter(Boolean).length;
  const pinchRatio = distance(lm[4],lm[8])/scale;
  const palm = [0,5,9,13,17].reduce((a,i)=>({x:a.x+lm[i].x/5,y:a.y+lm[i].y/5}),{x:0,y:0});
  return {pinchRatio, fist:count===0, open:count>=3, palm, cursor:{x:1-lm[8].x,y:lm[8].y}};
}

export class HandController {
  constructor({video,overlay,onState=()=>{},onGesture=()=>{}}) {
    Object.assign(this,{video,overlay,onState,onGesture});
    this.epoch=0; this.running=false; this.busy=false; this.lastStatus='';this.lastFrameTime=0;
    this.filters=Array.from({length:5},()=>new OneEuroFilter(1.8,.06));
    this.onHide=()=>this.stop();
    this.onVisibility=()=>{this.resetInput();if(document.hidden)this.setState('lost','页面已隐藏，手势识别暂停');};
    window.addEventListener('pagehide',this.onHide);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.resetInput();
  }
  setState(status,message) {
    if (status===this.lastStatus && message===this.lastMessage) return;
    this.lastStatus=status;this.lastMessage=message;this.onState({status,message});
  }
  resetInput() {
    this.previousPalm=null;this.previousDistance=null;this.inputMode='';
    this.pinchStart=0;this.pinchLatched=false;this.pinching=false;
    this.fistStart=0;this.fistLatched=false;
    this.filters?.forEach(f=>f.reset());
  }
  async start() {
    this.stop(false);
    const epoch=++this.epoch;
    this.setState('loading','正在加载本地手部识别…');
    try {
      if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('请在 HTTPS 页面或本机 localhost 中开启摄像头。');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
      if(epoch!==this.epoch){stream.getTracks().forEach(t=>t.stop());return false;}
      this.stream=stream;this.video.srcObject=stream;this.video.muted=true;this.video.playsInline=true;
      for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{
        if(epoch!==this.epoch)return;
        this.stop(false);this.setState('error','摄像头已断开或权限已撤销，可继续使用鼠标。');
      },{once:true});
      await this.video.play();
      if(epoch!==this.epoch)return false;
      try {await this.startWorker(epoch);}
      catch(error) {
        if(epoch!==this.epoch)return false;
        this.worker?.terminate();this.worker=null;
        // Safari or browsers without transferable video frames use throttled local CPU inference.
        const {FilesetResolver,HandLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
        const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href);
        const model=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:new URL('./models/hand_landmarker.task',import.meta.url).href,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minTrackingConfidence:.6});
        if(epoch!==this.epoch){model.close();return false;} this.model=model;
      }
      if(epoch!==this.epoch)return false;
      this.running=true;this.lastFrameTime=0;this.captureErrors=0;this.resetInput();this.setState('ready','摄像头已开启 · 把手掌放入画面');
      this.loop(epoch);return true;
    } catch(error) {
      if(epoch!==this.epoch)return false;
      this.stop(false);
      const permission=['NotAllowedError','PermissionDeniedError'].includes(error.name);
      const message=permission?'摄像头权限未开启，可继续用鼠标或触屏探索。':error.name==='NotFoundError'?'未找到摄像头，可继续用鼠标或触屏探索。':'摄像头或识别模型暂时不可用，请重试或使用鼠标。';
      this.setState('error',message);throw error;
    }
  }
  startWorker(epoch) {
    if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined'||typeof OffscreenCanvas==='undefined')return Promise.reject(new Error('Worker unavailable'));
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./hand-worker.js',import.meta.url));this.worker=worker;
      let settled=false;
      const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);this.cancelWorkerInit=null;error?reject(error):resolve();};
      const timer=setTimeout(()=>finish(new Error('Worker initialization timed out')),30000);
      this.cancelWorkerInit=()=>finish(new Error('Cancelled'));
      worker.onmessage=({data})=>{
        if(epoch!==this.epoch)return;
        if(data.type==='ready')finish();
        if(data.type==='result'){this.busy=false;this.captureErrors=0;if(!document.hidden)this.consume(data.landmarks,data.timestamp);}
        if(data.type==='error'){
          this.busy=false;
          if(!settled)finish(new Error(data.message));
          else {this.stop(false);this.setState('error','手势识别中断，请重新开启摄像头。');}
        }
      };
      worker.onerror=(e)=>{
        if(!settled)finish(new Error(e.message));
        else if(epoch===this.epoch){this.stop(false);this.setState('error','手势识别中断，请重新开启摄像头。');}
      };
      worker.postMessage({type:'init'});
    });
  }
  loop(epoch) {
    if(epoch!==this.epoch||!this.running)return;
    this.raf=requestAnimationFrame(()=>this.loop(epoch));
    const now=performance.now();
    if(document.hidden||this.busy||this.video.readyState<2||now-this.lastFrameTime<(this.worker?65:100))return;
    this.lastFrameTime=now;this.busy=true;
    if(this.worker) {
      createImageBitmap(this.video).then(frame=>{
        if(epoch!==this.epoch||!this.worker){frame.close();return;}
        try {this.worker.postMessage({type:'frame',frame,timestamp:now},[frame]);}
        catch(error){frame.close();throw error;}
      }).catch(()=>{
        if(epoch!==this.epoch)return;
        this.busy=false;this.captureErrors++;
        if(this.captureErrors>=3){this.stop(false);this.setState('error','暂时无法读取摄像头画面，请重新开启。');}
      });
    } else {
      try {const result=this.model.detectForVideo(this.video,now);this.consume(result.landmarks,now);}
      catch(_){this.stop(false);this.setState('error','手势识别中断，请重新开启摄像头。');}
      finally {this.busy=false;}
    }
  }
  consume(hands,now) {
    this.draw(hands);
    if(!hands?.length){this.resetInput();this.setState('lost','未检测到手掌 · 请保持光线充足');return;}
    this.setState('tracking',hands.length>1?'已追踪双手 · 拉开靠近，合拢拉远':'已追踪手掌 · 张掌移动，捏合选星');
    const h=classifyHand(hands[0]);if(!h)return;
    const cx=clamp(this.filters[0].filter(h.cursor.x,now),0,1),cy=clamp(this.filters[1].filter(h.cursor.y,now),0,1);
    this.pinching=!h.fist && h.pinchRatio<(this.pinching ? .42 : .30);
    this.onGesture({type:'cursor',x:cx,y:cy,pinching:this.pinching});
    if(hands.length===2) {
      this.pinchStart=0;this.fistStart=0;
      const a=classifyHand(hands[1]);
      const dist=this.filters[4].filter(Math.hypot(h.palm.x-a.palm.x,h.palm.y-a.palm.y),now);
      if(this.inputMode==='two'&&this.previousDistance!==null){
        const delta=clamp((this.previousDistance-dist)*2.8,-.12,.12);
        if(Math.abs(delta)>.0015)this.onGesture({type:'zoom',delta});
      }
      this.previousDistance=dist;this.inputMode='two';this.previousPalm=null;return;
    }
    if(this.inputMode==='two'){this.previousPalm=null;this.previousDistance=null;this.pinchLatched=false;this.fistLatched=false;}
    this.inputMode='single';
    if(this.pinching){
      if(!this.pinchStart)this.pinchStart=now;
      if(!this.pinchLatched&&now-this.pinchStart>=500){this.onGesture({type:'focus',x:cx,y:cy});this.pinchLatched=true;}
    }else{this.pinchStart=0;this.pinchLatched=false;}
    if(h.fist&&!this.pinching){
      if(!this.fistStart)this.fistStart=now;
      if(!this.fistLatched&&now-this.fistStart>=600){this.onGesture({type:'pause'});this.fistLatched=true;}
    }else{this.fistStart=0;this.fistLatched=false;}
    const px=this.filters[2].filter(1-h.palm.x,now),py=this.filters[3].filter(h.palm.y,now);
    if(h.open&&!this.pinching&&!h.fist){
      if(this.previousPalm){
        const dx=clamp(px-this.previousPalm.x,-.06,.06),dy=clamp(py-this.previousPalm.y,-.06,.06);
        if(Math.hypot(dx,dy)>.0015)this.onGesture({type:'rotate',dx:dx*2.2,dy:dy*2.2});
      }
      this.previousPalm={x:px,y:py};
    }else this.previousPalm=null;
  }
  draw(hands) {
    if(!this.overlay)return;
    const ctx=this.overlay.getContext('2d');if(!ctx)return;
    const w=this.overlay.width=320,h=this.overlay.height=240;
    ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(182,219,255,.8)';ctx.fillStyle='#e6d5ff';ctx.lineWidth=1.5;
    for(const points of hands||[]){
      ctx.beginPath();for(const[a,b]of connections){ctx.moveTo((1-points[a].x)*w,points[a].y*h);ctx.lineTo((1-points[b].x)*w,points[b].y*h);}ctx.stroke();
      for(const p of points){ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,2.5,0,Math.PI*2);ctx.fill();}
    }
  }
  stop(announce=true) {
    ++this.epoch;this.running=false;cancelAnimationFrame(this.raf);
    this.cancelWorkerInit?.();this.cancelWorkerInit=null;
    this.worker?.terminate();this.worker=null;
    this.model?.close();this.model=null;
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;this.busy=false;this.resetInput();this.draw([]);
    if(announce)this.setState('off','摄像头已关闭');
  }
  destroy(){this.stop();window.removeEventListener('pagehide',this.onHide);document.removeEventListener('visibilitychange',this.onVisibility);}
}
