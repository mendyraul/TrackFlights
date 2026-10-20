import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/table", "/analytics", "/behind-the-scenes"].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: path === "/behind-the-scenes" ? "monthly" : "always",
  }));
}
