import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "jarins — Life OS",
    short_name: "jarins",
    description: "Get life out of your head and know what matters now.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#315f4b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
