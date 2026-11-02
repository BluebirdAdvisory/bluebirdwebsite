export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/uploads");
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });

  eleventyConfig.addCollection("services", (api) =>
    api.getFilteredByGlob("src/services/*.md").sort((a, b) => a.data.order - b.data.order)
  );
  eleventyConfig.addCollection("caseStudies", (api) =>
    api.getFilteredByGlob("src/case-studies/*.md").sort((a, b) => a.data.title.localeCompare(b.data.title))
  );

  // Case studies tagged with a given service title
  eleventyConfig.addFilter("forService", (list, title) =>
    (list || []).filter((c) => (c.data.services || []).includes(title))
  );
  eleventyConfig.addFilter("year", () => new Date().getFullYear());
  // Events (src/events/*.md), split into upcoming and past by today's date in Canberra at build time.
  // An event stays upcoming through its event_date (or end_date); the daily rebuild moves it the morning after.
  eleventyConfig.addCollection("events", (api) => api.getFilteredByGlob("src/events/*.md"));
  const canberraToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const lastDay = (e) => String(e.data.end_date || e.data.event_date);
  eleventyConfig.addFilter("upcoming", (events) =>
    (events || []).filter((e) => lastDay(e) >= canberraToday())
      .sort((a, b) => String(a.data.event_date).localeCompare(String(b.data.event_date)))
  );
  eleventyConfig.addFilter("pastEvents", (events) =>
    (events || []).filter((e) => lastDay(e) < canberraToday())
      .sort((a, b) => String(b.data.event_date).localeCompare(String(a.data.event_date)))
  );
  // "2026-11-11" -> "11 November 2026"; with "short" -> "11 Nov"
  eleventyConfig.addFilter("eventDate", (iso, style) => {
    const [y, m, d] = String(iso).split("-").map(Number);
    const opts = style === "short" ? { day: "numeric", month: "short" } : { day: "numeric", month: "long", year: "numeric" };
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });
  });
  // Header photo for a case study: the photo of its first service
  eleventyConfig.addFilter("servicePhoto", (services, all) =>
    (all || []).find((s) => s.data.title === (services || [])[0])?.data.hero_photo
  );

  // Render a markdown string held in front matter or a data file
  eleventyConfig.addFilter("md", function (str) {
    return str ? eleventyConfig.markdownLibrary?.render(str) ?? str : "";
  });
  eleventyConfig.amendLibrary("md", (lib) => { eleventyConfig.markdownLibrary = lib; });
  // Inline markdown (bold, links) for one-line strings such as service offerings
  eleventyConfig.addFilter("mdInline", (str) =>
    str ? eleventyConfig.markdownLibrary?.renderInline(str) ?? str : ""
  );

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
