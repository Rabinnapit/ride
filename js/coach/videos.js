// RiderHQ — real-life demonstration videos (YouTube) for gym exercises. key → video id.
// Picked for a clear "how to" demo. The player loads only when you tap play (youtube-nocookie).
export const VIDEOS = {
  gobletsquat: 'JO7D6GJ98wY', backsquat: 'irA7MTz96ho', trapbar: 'WzvsIU9FW60', rdl: 'hQgFixeXdZo', split: 'VPhhE6bBzZE',
  stepup: 'dQqApCGd5Ss', hipthrust: 'huIb360qhkY', calf: 'gwLzBJYoWlI', row: 'ZtTwgJTBjOQ', cablerow: 'f_r95UajQcg',
  pulldown: 'AOpi-p0cJkc', pushup: 'i9sTjhN4Z3M', cgbench: 'a2G3IdaTcPU', pushdown: 'IBGvZUzoQiQ', ohtri: 'xbNm9fRoUTw',
  dips: 'IExSaQUjyIw', ohp: 'nNMR9fRGRjQ', latraise: 'Y29xKcze8Ik', bandfly: 'GhzrgC8VDok', farmer: '8OtwXwrJizk',
  pallof: 'LA6Uc5yIV1c', deadbug: 'g_BYB0R-4Ws', birddog: 'ZdAHe9_HeEw', sideplank: 'AU0NwxmV__I', bridge: 'wPM8icPu6H8',
  hipadd: 'SIQrpq6YnT8', bandwalk: 'pZsX8tP9n5o', couch: '-rsIS-wl-ig',
};
export const hasVideo = key => !!VIDEOS[key];
export const embedUrl = key => `https://www.youtube-nocookie.com/embed/${VIDEOS[key]}?rel=0&modestbranding=1&playsinline=1&autoplay=1`;
export const watchUrl = key => `https://www.youtube.com/watch?v=${VIDEOS[key]}`;
export const thumbUrl = key => `https://i.ytimg.com/vi/${VIDEOS[key]}/hqdefault.jpg`;
