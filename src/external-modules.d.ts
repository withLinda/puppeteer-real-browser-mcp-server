declare module 'xvfb' {
  export default class Xvfb {
    constructor(options?: { silent?: boolean; xvfb_args?: string[] });
    startSync(): void;
    stopSync(): void;
  }
}
