import { Frame } from 'Frame';

type Size = 'cover' | 'contain' | 'auto';
interface Options {
  frames: Frame[],
  canvas: HTMLCanvasElement | string,
  width: number | string,
  height: number | string,
  size: Size,
  sizeCanvasToImage: boolean;
  autoplay?: boolean,
  speed?: number,
  loop?: boolean,
  direction?: string,
  replay?: boolean,
  loaded: () => {};
}

interface ISequencer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  width: number | string;
  height: number | string;
  firstImage: boolean; // I don't know what this is for???
  frames: Frame[];
  frameCount: number;
}
class SequencerBase implements ISequencer {
  canvas;
  ctx;
  width;
  height;
  firstImage = false;
  frameCount = 0;
  frames;
  loaded;
  currentFrame = 0;
  currentRAF = 0;
  autoplay: boolean;

  constructor(options: Options) {
    this.canvas = this.initCanvas(options.canvas);
    this.ctx = this.initCtx();
    this.width = Number(options.width);
    this.height = Number(options.height);
    this.frames = options.frames;
    this.loaded = options.loaded ? options.loaded : () => console.log('frames loaded');
    this.autoplay = options.autoplay ? options.autoplay : true;

    console.log('initialized Sequencer');

    this.resizeCanvas();
    this.load();
  }

  initCanvas(canvas: HTMLCanvasElement | string): HTMLCanvasElement {
    if (typeof canvas === 'string') {
      const isCanvas = document.querySelector(canvas) as HTMLCanvasElement;
      if (!isCanvas) throw ('Invalid selector supplied for canvas element');
      return isCanvas;
    }
    else if (canvas instanceof HTMLCanvasElement) {
      return canvas;
    }
    else throw ('Invalid canvas element supplied');
  }

  initCtx(): CanvasRenderingContext2D | null {
    return this.canvas.getContext('2d');
  }

  resizeCanvas() {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  load() {
    if (!this.frames.length) throw ('No frames supplied');
    if (this.frames[0] instanceof HTMLImageElement) return;

    this.frameCount = this.frames.length;
    const worker = new Worker('../public/js/image-worker.js');
    worker.postMessage(this.frames);
    worker.addEventListener('message',
      async (event) => {
        const imagePromises = event.data.map(async (frame: Frame, index: number) => {
          if (frame) {
            return await this.createImage(frame, index);
          }
        })
        const imageElements = await Promise.all(imagePromises);
        this.frames = imageElements.filter(Boolean);
        this.loaded();
        if (this.autoplay) this.play();
      }, false)
  }

  createImage(frame: Frame, index: number): Promise<Frame | null> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
      if (typeof frame === "string") img.src = frame;
    });
  }

  play() {
    if (this.currentFrame >= this.frameCount) {
      console.log('stopped')
      return cancelAnimationFrame(this.currentRAF);
    }
    console.log(this.currentFrame);
    this.ctx?.drawImage(this.frames[this.currentFrame] as HTMLImageElement, 0, 0)
    this.currentFrame++;
    this.currentRAF = requestAnimationFrame(this.play.bind(this))
  }
}

export default function Sequencer(options: Options) {
  if (!options.canvas) throw ('canvas parameter missing');

  return new SequencerBase(options);
}