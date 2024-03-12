import { Frame } from 'Frame';

type Size = 'cover' | 'contain' | 'auto';

type Direction = 'normal' | 'reverse';

type Repeat = 'no-repeat' | undefined;
interface Options {
    frames: Frame[],
    canvas: HTMLCanvasElement | string,
    width: number | string,
    height: number | string,
    size: Size,
    sizeCanvasToImage: boolean;
    repeat?: Repeat;
    autoplay?: boolean,
    speed?: number,
    loop?: boolean,
    direction?: Direction,
    debug?: boolean,
    onLoaded?: Function;
    onComplete?: Function;
    onPaused?: Function;
}
/*

TODO: add stop() - done
TODO: add pause() - done
TODO: replace direction setter with setDirection() method, cleaner - done
TODO: implement play() fallback if frames aren't loaded yet - done
TODO: calculate size based on cover/contain - done
TODO: make width and height optional so canvas size can be set from css - done
TODO: implement tick() and speed property to control animation speed
TODO: implement seek(), calculate progress in percentages?
TODO: add count for loops
TODO: add event methods (onComplete, onLoopComplete, onEnterFrame)
TODO: add progressive loading
TODO: experiment with DOM events as well 
TODO: implement sizeCanvasToImage
TODO: add batched loading, or option to load in chunks
TODO: add option to segment the frames into groups 
TODO: add tiling in x and y planes
TODO: check cover calculation values, make sure there are no over/under flows
*/
class SequencerBase implements Options {
    canvas!: HTMLCanvasElement; // Assigned in setupOptions
    ctx!: CanvasRenderingContext2D | null; // Assigned in setupOptions
    width: number = 0;
    height: number = 0;
    frames: Frame[] = [];
    autoplay: boolean = false;
    size: Size = 'cover';
    sizeCanvasToImage: boolean = false;
    repeat: Repeat = undefined;
    lastFrameIndex: number = 0;
    firstFrameIndex: number = 0;
    loop: boolean = false;
    debug: boolean = true;
    _repeatCount: number = 0;
    _repeatDirection: 'x' | 'y' = 'x';
    _direction: Direction = 'normal';
    _framesLoaded: boolean = false;
    _frameWidth: number = 0;
    _frameHeight: number = 0;
    _dWidth: number = 0;
    _dHeight: number = 0;
    onLoaded?: Function;
    onComplete?: Function;
    onPaused?: Function;

    set direction(direction: Direction) {
        this._direction = direction;
        this.setDirection(this._direction);
    }

    setDirection(direction: Direction) {
        if (direction === 'normal') {
            this.lastFrameIndex = this.frames.length - 1;
            this.firstFrameIndex = 0;
            if (this.debug) console.log('direction was set', this.lastFrameIndex);
        } else {
            this.lastFrameIndex = 0;
            this.firstFrameIndex = this.frames.length - 1;
            if (this.debug) console.log('direction was set', this.lastFrameIndex);
        }
    }

    private currentFrame = 0;
    private currentRAF = 0;

    constructor(options: Options) {
        this.setupOptions(options);
        this.load();
    }

    setupOptions(options: Options) {
        this.canvas = this.initCanvas(options.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.canvas.width = options.width ? Number(options.width) : this.canvas.getBoundingClientRect().width;
        this.canvas.height = options.height ? Number(options.height) : this.canvas.getBoundingClientRect().height;

        this.size = options.size;

        this.repeat = options.repeat ? options.repeat : undefined;

        this.frames = options.frames;

        this.loop = typeof options.loop === 'boolean' ? options.loop : false;
        this.autoplay = typeof options.autoplay === 'boolean' ? options.autoplay : true;

        this.onLoaded = typeof options.onLoaded === 'function' ? options.onLoaded : () => { }
        this.onComplete = typeof options.onComplete === 'function' ? options.onComplete : () => { }
        this.onPaused = typeof options.onPaused === 'function' ? options.onPaused : () => { }

        this.direction = options.direction ? options.direction : 'normal';

        if (this.debug) console.log('initialized Sequencer');
    }

    loaded() {
        this._framesLoaded = true;
        this.resizeCanvas();
        if (this.debug) console.log('loaded');
        if (this.onLoaded) this.onLoaded();
    }

    complete() {
        if (this.debug) console.log('completed');
        if (this.onComplete) this.onComplete();
    }

    pause() {
        cancelAnimationFrame(this.currentRAF);
        if (this.onPaused) this.onPaused();
        if (this.debug) console.log('paused');
    }

    stop() {
        cancelAnimationFrame(this.currentRAF);
        this.currentFrame = this.firstFrameIndex;
        this.complete();
    }

    initCanvas(canvas: HTMLCanvasElement | string): HTMLCanvasElement {
        if (!(canvas instanceof HTMLCanvasElement) && typeof canvas !== 'string') throw new Error('Invalid canvas element supplied');

        if (typeof canvas === 'string') return this.lookupCanvas(canvas);

        return canvas;
    }

    lookupCanvas(selector: string) {
        const isCanvas = document.querySelector(selector) as HTMLCanvasElement;
        if (!(isCanvas instanceof HTMLCanvasElement)) throw new Error('Invalid selector supplied for canvas element');

        return isCanvas;
    }

    resizeCanvas() {
        this._frameWidth = this.frames[0] instanceof HTMLImageElement ? this.frames[0].width : 0;
        this._frameHeight = this.frames[0] instanceof HTMLImageElement ? this.frames[0].height : 0;

        const widthRatio = this._frameWidth / this.canvas.width
        const heightRatio = this._frameHeight / this.canvas.height;
        if (this.size === 'cover') {
            if (widthRatio < heightRatio) {
                this._frameWidth = this.canvas.width;
                this._frameHeight = this._frameHeight / widthRatio;
            } else {
                this._frameHeight = this.canvas.height;
                this._frameWidth = this._frameWidth / heightRatio;
            }
        } else if (this.size === 'contain') {
            if (widthRatio > heightRatio) {
                this._frameWidth = this.canvas.width;
                this._frameHeight = this._frameHeight / widthRatio;
                if (this.repeat === undefined) {
                    this._repeatCount = widthRatio;
                    this._repeatDirection = 'x';
                }
            } else {
                this._frameHeight = this.canvas.height;
                this._frameWidth = this._frameWidth / heightRatio;
                if (this.repeat === undefined) {
                    this._repeatCount = heightRatio;
                    this._repeatDirection = 'y';
                }
            }
        }
    }

    load() {
        if (!this.frames.length) throw new Error('No frames supplied');
        if (this.frames[0] instanceof HTMLImageElement) return;

        const worker = new Worker('../public/js/image-worker.js');
        worker.postMessage(this.frames);
        worker.addEventListener('message',
            async (event) => {
                const imagePromises = event.data.map(async (frame: Frame, index: number) => {
                    if (frame) {
                        return await this.createImage(frame, index);
                    }
                })
                this.frames = (await Promise.all(imagePromises)).filter(Boolean);
                this.loaded();
                if (this.autoplay) this.play();
            }, false);
    }

    createImage(frame: Frame, index: number): Promise<Frame | null> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            if (typeof frame === "string") img.src = frame;
        });
    }

    play(): void | boolean {
        if (!this._framesLoaded) return this.autoplay = true;

        if (this.currentFrame > this.lastFrameIndex) {
            this.stop();

            if (this.loop) return this.play();
            return;
        }

        for (let i = 0; i < this._repeatCount + 1; i++) {
            if (this._repeatDirection === 'x') {
                this.ctx?.drawImage(this.frames[this.currentFrame] as HTMLImageElement, 0, i * this._frameHeight, this._frameWidth, this._frameHeight)
            } else {
                this.ctx?.drawImage(this.frames[this.currentFrame] as HTMLImageElement, i * this._frameWidth, 0, this._frameWidth, this._frameHeight)
            }
        }
        this._direction === 'normal' ? this.currentFrame++ : this.currentFrame--;
        this.currentRAF = requestAnimationFrame(this.play.bind(this))
    }


    replay() {
        this.stop();
        this.play();
    }
}

export default function Sequencer(options: Options) {
    if (!options.canvas) throw new Error('canvas parameter missing');

    return new SequencerBase(options);
}