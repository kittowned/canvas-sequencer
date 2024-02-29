import { Frame } from 'Frame';

type Size = 'cover' | 'contain' | 'auto';

type Direction = 'normal' | 'reverse';

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
TODO: calculate size based on cover/contain/auto
TODO: change loop to accomodate numerical values, to loop x number of times
TODO: implement tick() and speed property to control player speed
TODO: implement seek(), calculate progress in percentages?
TODO: add event methods (onComplete, onLoopComplete, onEnterFrame, onSegmentStart)
TODO: experiment with DOM events as well 
*/
class SequencerBase implements Options {
    canvas!: HTMLCanvasElement; // Assigned in setupOptions
    ctx!: CanvasRenderingContext2D | null; // Assigned in setupOptions
    width: number = 0;
    height: number = 0;
    frames: Frame[] = [];
    autoplay: boolean = false;
    sizeCanvasToImage: boolean = false;
    size: Size = 'cover';
    lastFrameIndex: number = 0;
    firstFrameIndex: number = 0;
    loop: boolean = false;
    debug: boolean = true;
    _direction: Direction = 'normal';
    _framesLoaded: boolean = false;
    _drawWidth: number = 0;
    _drawHeight: number = 0;
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

        this.width = Number(options.width);
        this.height = Number(options.height);

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
        if (this.debug) console.log('completed');
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
        if (this.size === 'cover') {
            this._drawWidth = this.frames[0] instanceof HTMLImageElement ? this.frames[0].width : 0;
            this._drawHeight = this.frames[0] instanceof HTMLImageElement ? this.frames[0].height : 0;

            if (this._drawWidth === this.width) {
                this._dWidth = this.width;
            }
            if (this._drawWidth < this.width) {
                this._dWidth = this._drawWidth;
            }
            if (this._drawWidth > this.width) {
                this._dWidth = this.width;
            }

            if (this._drawHeight === this.height) {
                this._dHeight = this.height;
            }
            if (this._drawHeight < this.height) {
                this._dHeight = this._drawHeight;
            }
            if (this._drawHeight > this.height) {
                this._dHeight = this.height;
            }

        }
        this.canvas.width = this.width;
        this.canvas.height = this.height;

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

    play() {
        if (!this._framesLoaded) return this.autoplay = true; // guard in case play() was called before loaded event

        if (this.currentFrame === this.lastFrameIndex) {
            this.stop();

            if (this.loop) return this.replay();
            return;
        }

        // this.ctx?.drawImage(this.frames[this.currentFrame] as HTMLImageElement, 0, 0)
        this.ctx?.drawImage(this.frames[this.currentFrame] as HTMLImageElement, 0, 0, this._drawWidth, this._drawHeight, 0, 0, this._dWidth, this._dHeight)
        this._direction === 'normal' ? this.currentFrame++ : this.currentFrame--;
        this.currentRAF = requestAnimationFrame(this.play.bind(this))
    }

    replay() {
        this.play();
    }
}

export default function Sequencer(options: Options) {
    if (!options.canvas) throw new Error('canvas parameter missing');

    return new SequencerBase(options);
}