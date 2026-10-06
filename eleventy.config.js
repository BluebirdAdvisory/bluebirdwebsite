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
