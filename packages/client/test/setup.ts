// Test-Setup für die Client-Suite.
//
// jsdom implementiert einige Layout- und Scroll-APIs bewusst nicht (es rendert
// nichts wirklich). Der Produktionscode ruft sie aber legitim auf, deshalb
// werden sie hier ergänzt, statt den Code für die Tests zu verbiegen.

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom kann kein WebGL. Ohne diesen Stub würde webglSupported() bei jedem
// Rendern eine "Not implemented"-Warnung erzeugen. `null` ist genau das, was
// ein Browser ohne WebGL liefert – die Tests laufen dadurch im 2D-Fallback.
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
}
