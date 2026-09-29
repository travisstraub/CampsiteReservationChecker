import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Campsite Watch",
    short_name: "Campsites",
    description: "Search ReserveCalifornia campsites and get notified when sites open up.",
    start_url: "/alerts",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#2f6b3d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
