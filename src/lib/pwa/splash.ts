import devices from './splash-devices.json' with { type: 'json' };

/** iOS launch screens are matched by colour scheme too, so dark mode doesn't open on a flash. */
export const SPLASH_SCHEMES = { light: '#F2F2F7', dark: '#000000' } as const;

type Orientation = 'portrait' | 'landscape';

/** Every launch-screen file, with the size it's drawn at. Shared with scripts/generate-assets. */
export function splashFiles() {
  return devices.flatMap((d) =>
    (['portrait', 'landscape'] as Orientation[])
      .filter((o) => o === 'portrait' || ('tablet' in d && d.tablet))
      .flatMap((orientation) =>
        (Object.keys(SPLASH_SCHEMES) as (keyof typeof SPLASH_SCHEMES)[]).map((scheme) => {
          const [w, h] =
            orientation === 'portrait'
              ? [d.width * d.ratio, d.height * d.ratio]
              : [d.height * d.ratio, d.width * d.ratio];
          return {
            device: d,
            orientation,
            scheme,
            width: w,
            height: h,
            url: `/splash/${scheme}-${w}x${h}.png`,
          };
        }),
      ),
  );
}

/**
 * The installed app's launch screens on iPhone and iPad (brief §9: splash screen). iOS picks the
 * image whose media query matches the device exactly; device-width and device-height stay in
 * portrait terms when it rotates.
 */
export function startupImages() {
  return splashFiles().map(({ device, orientation, scheme, url }) => ({
    url,
    media: [
      `(device-width: ${device.width}px)`,
      `(device-height: ${device.height}px)`,
      `(-webkit-device-pixel-ratio: ${device.ratio})`,
      `(orientation: ${orientation})`,
      `(prefers-color-scheme: ${scheme})`,
    ].join(' and '),
  }));
}
