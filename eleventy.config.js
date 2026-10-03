export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/uploads");
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });

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

  // Render a markdown string held in front matter or a data file
  eleventyConfig.addFilter("md", function (str) {
    return str ? eleventyConfig.markdownLibrary?.render(str) ?? str : "";
  });
  eleventyConfig.amendLibrary("md", (lib) => { eleventyConfig.markdownLibrary = lib; });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
