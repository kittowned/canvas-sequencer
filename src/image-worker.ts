import { Frame } from 'Frame';

self.addEventListener(
  "message",
  async function (e) {
    const frames = e.data;
    const images = await Promise.all(
      frames.map(async (frame: Frame): Promise<Frame | null> => {
        try {
          if (typeof frame === 'string') {
            const response = await fetch(frame);
            const fileBlob = await response.blob();
            if (fileBlob.type === "image/jpeg") {
              return URL.createObjectURL(fileBlob);
            }
          }
          return null;
        } catch (e) {
          return null;
        }
      })
    );
    self.postMessage(images);
  },
  false
);