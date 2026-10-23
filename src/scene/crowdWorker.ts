import { placeCrowd, type PlacementInput } from './crowdPlacement';

// Places the crowd in the background (see crowdPlacement.ts), so the page keeps running meanwhile.
self.onmessage = (e: MessageEvent<PlacementInput>) => postMessage(placeCrowd(e.data));
