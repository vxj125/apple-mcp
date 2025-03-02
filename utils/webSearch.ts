interface SearchResult {
    title: string;
    url: string;
    displayUrl: string;
    snippet: string;
  }
  
  interface ContentResult extends SearchResult {
    content: string | null;
    error?: string;
  }
  
  interface SearchResponse {
    query: string;
    results: SearchResult[];
    error?: string;
  }
  
  interface ContentResponse {
    query: string;
    results: ContentResult[];
    error?: string;
  }
  
  interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
  }
  
  /**
   * Makes an HTTP/HTTPS request and returns the response as a string
   */
  async function makeRequest(
    url: string,
    options: RequestOptions = {},
  ): Promise<string> {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        ...(options.headers || {})
      },
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    });
  
    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status}`);
    }
  
    return response.text();
  }
  
  /**
   * Cleans HTML entities and tags from text
   */
  function cleanHTML(text: string): string {
    // Basic HTML entity decoding
    let decodedText = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  
    // Remove HTML tags
    decodedText = decodedText.replace(/<[^>]+>/g, "");
  
    return decodedText.trim();
  }
  
  // SEARCH IMPLEMENTATION
  
  /**
   * Extracts search results from DuckDuckGo HTML response
   */
  function extractDDGResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];
  
    // Regular expression to extract result blocks
    const resultRegex =
      /<div class="result results_links results_links_deep web-result[^"]*">\s*<div class="links_main links_deep result__body">([\s\S]*?)<div class="clear"><\/div>\s*<\/div>\s*<\/div>/g;
  
    let resultMatch;
    let count = 0;
  
    // Limit to top 3 results for efficiency
    while ((resultMatch = resultRegex.exec(html)) !== null && count < 3) {
      const resultBlock = resultMatch[1];
  
      // Extract title
      const titleRegex =
        /<a rel="nofollow" class="result__a" href="[^"]+">([\s\S]*?)<\/a>/;
      const titleMatch = resultBlock.match(titleRegex);
  
      // Extract URL
      const urlRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"/;
      const urlMatch = resultBlock.match(urlRegex);
  
      // Extract display URL
      const displayUrlRegex = /<a class="result__url" href="[^"]+">\s*([^<]+)\s*<\/a>/;
      const displayUrlMatch = resultBlock.match(displayUrlRegex);
  
      // Extract snippet
      const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
      const snippetMatch = resultBlock.match(snippetRegex);
  
      if (titleMatch && urlMatch && displayUrlMatch && snippetMatch) {
        results.push({
          title: cleanHTML(titleMatch[1]),
          url: urlMatch[1],
          displayUrl: cleanHTML(displayUrlMatch[1]),
          snippet: cleanHTML(snippetMatch[1])
        });
        count++;
      }
    }
  
    return results;
  }
  
  /**
   * Searches DuckDuckGo and returns results
   */
  async function searchDuckDuckGo(query: string): Promise<SearchResponse> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
  
      const html = await makeRequest(searchUrl);
      const results = extractDDGResults(html);

      console.error(results);

      return {
        query,
        results
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("DuckDuckGo search failed:", errorMessage);
      return {
        query,
        error: errorMessage,
        results: []
      };
    }
  }
  
  /**
   * Extracts main content from HTML
   */
  function extractMainContent(content: string): string {
    // Remove common non-content elements
    content = content.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      " ",
    );
    content = content.replace(
      /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
      " ",
    );
    content = content.replace(
      /<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi,
      " ",
    );
    content = content.replace(
      /<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi,
      " ",
    );
    content = content.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
    content = content.replace(
      /<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi,
      " ",
    );
  
    // Extract text from main/article/div with content if possible
    let mainContent = "";
    const mainRegex = /<main\b[^<]*(?:(?!<\/main>)<[^<]*)*<\/main>/gi;
    const mainMatch = mainRegex.exec(content);
    if (mainMatch) {
      mainContent = mainMatch[0];
    } else {
      const articleRegex =
        /<article\b[^<]*(?:(?!<\/article>)<[^<]*)*<\/article>/gi;
      const articleMatch = articleRegex.exec(content);
      if (articleMatch) {
        mainContent = articleMatch[0];
      } else {
        // If no clear main content, use the whole body
        const bodyRegex = /<body\b[^<]*(?:(?!<\/body>)<[^<]*)*<\/body>/gi;
        const bodyMatch = bodyRegex.exec(content);
        if (bodyMatch) {
          mainContent = bodyMatch[0];
        } else {
          mainContent = content;
        }
      }
    }
  
    // Remove remaining HTML tags
    let textContent = mainContent.replace(/<[^>]+>/g, " ");
  
    // Clean up whitespace
    textContent = textContent.replace(/\s+/g, " ").trim();
  
    // Decode HTML entities
    textContent = textContent
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  
    return textContent;
  }
  
  /**
   * Fetch and extract content from a URL
   */
  async function fetchPageContent(
    url: string,
  ): Promise<{ url: string; content: string | null; error?: string }> {
    try {
      // Set a shorter timeout for content requests
      const html = await makeRequest(url, { timeout: 15000 });
      const content = extractMainContent(html);
  
      // Extract title
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? cleanHTML(titleMatch[1]) : "";
  
      return {
        url,
        content,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching content from ${url}:`, errorMessage);
      return {
        url,
        error: errorMessage,
        content: null,
      };
    }
  }
  
  // MAIN SEARCH FUNCTION
  
  /**
   * Complete web search function that fetches search results and their content
   */
  export async function webSearch(query: string): Promise<ContentResponse> {
    try {
      // Step 1: Get search results from DuckDuckGo
      const searchResults = await searchDuckDuckGo(query);
  
      if (searchResults.error || searchResults.results.length === 0) {
        return {
          query,
          error: searchResults.error || "No search results found",
          results: [],
        };
      }
  
      // Step 2: Fetch content for each result (top 3 only)
      const fetchPromises = searchResults.results.map(async (result) => {
        try {
          const contentData = await fetchPageContent(result.url);
          return {
            ...result,
            content: contentData.content,
            error: contentData.error,
          };
        } catch (error) {
          return {
            ...result,
            content: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
  
      // Use Promise.allSettled to ensure all requests complete, even if some fail
      const settledPromises = await Promise.allSettled(fetchPromises);
  
      // Process results
      const fullResults = settledPromises.map((promise, index) => {
        if (promise.status === "fulfilled") {
          return promise.value;
        } else {
          // For rejected promises, return the result with an error
          return {
            ...searchResults.results[index],
            content: null,
            error: `Failed to fetch content: ${promise.reason}`,
          };
        }
      });
  
      return {
        query,
        results: fullResults,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Web search failed:", errorMessage);
      return {
        query,
        error: errorMessage,
        results: [],
      };
    }
  }
  
  
  export default {
    webSearch,
    searchDuckDuckGo,
    fetchPageContent,
  };