import ReactDOM from "react-dom/client";
import App from "./App";
import { initConsoleCapture } from "./utils/consoleCapture";

// 必须在 React 渲染前初始化控制台捕获
initConsoleCapture();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
