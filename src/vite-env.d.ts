/// <reference types="vite/client" />

interface Window {
  JitsiMeetExternalAPI?: new (
    domain: string,
    options: Record<string, unknown>,
  ) => JitsiApi;
}

interface JitsiApi {
  addListener(event: string, listener: (...args: unknown[]) => void): void;
  executeCommand(command: string, ...args: unknown[]): void;
  dispose(): void;
}
