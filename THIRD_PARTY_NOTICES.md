# 第三方代码、模型与许可说明

星汐 ASTRA 的原创代码采用根目录的 [MIT License](LICENSE)。以下第三方代码与模型按各自许可证分发，原有版权、许可与归属声明继续有效。

## Three.js

- 版本：r160。
- 项目：<https://github.com/mrdoob/three.js>。
- 许可证：MIT；Copyright © 2010–2023 three.js authors。
- 本地文件：`web/vendor/three.module.js`。
- 完整许可：[THREE-MIT.txt](web/licenses/THREE-MIT.txt)。
- 用途：WebGL 渲染、三维场景、材质与几何基础。

## MediaPipe Tasks Vision

- 版本：0.10.21。
- 项目：<https://github.com/google-ai-edge/mediapipe>。
- 官方接入说明：<https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js>。
- 许可证：Apache License 2.0。
- 本地目录：`web/vendor/mediapipe/`，包含浏览器模块以及 SIMD 与非 SIMD WASM 运行文件。
- 完整许可：[MEDIAPIPE-APACHE-2.0.txt](web/licenses/MEDIAPIPE-APACHE-2.0.txt)。
- 用途：在浏览器中运行手部关键点推理。项目自行实现摄像头控制、手势判定与星空交互映射。

## Google Hand Landmarker 模型

- 模型版本目录：`hand_landmarker/hand_landmarker/float16/1`。
- 本地文件：`web/models/hand_landmarker.task`。
- 原始模型：[Google 官方发布文件](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task)。
- 官方指南：[Hand Landmarker](https://developers.google.cn/edge/mediapipe/solutions/vision/hand_landmarker/index)。
- 模型卡：[Hand Tracking (Lite/Full) with Fairness, October 2021](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf)。该模型卡第 2 页标示 Apache 2.0 许可。
- 许可证：Apache License 2.0；本地完整文本同 [MEDIAPIPE-APACHE-2.0.txt](web/licenses/MEDIAPIPE-APACHE-2.0.txt)。
- 用途：估计手部关键点。本项目没有训练或声称拥有这一预训练模型。

## One Euro Filter / gesture-particles

- 来源：<https://github.com/Wlarskog/gesture-particles> 中的 `src/utils/OneEuroFilter.ts`。
- 原作者：William Larskog；Copyright © 2026 William Larskog。
- 许可证：MIT。
- 本地移植文件：`web/one-euro.js`。
- 完整许可：[GESTURE-PARTICLES-MIT.txt](web/licenses/GESTURE-PARTICLES-MIT.txt)。
- 修改说明：移除 TypeScript 类型标注并以 JavaScript 模块提供，保留原滤波算法，用于平滑手势位置。

本项目使用上述组件，不代表其作者对星汐 ASTRA 提供认可、担保或背书。再分发时，请保留适用的完整许可证及版权声明。
