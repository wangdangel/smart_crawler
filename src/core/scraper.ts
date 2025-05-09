import * as cheerio from 'cheerio';
import prisma from '../db/prismaClient'; // Import shared instance
import { URL } from 'url';
import logger from '../utils/logger';
import { CacheService } from '../services/cacheService';
import { extractMainContent, extractMetadata, extractLinks } from '../utils/contentExtractor';
import { requestPool } from '../utils/requestPool';
import { httpClient, createHttpClient } from '../utils/httpClient';
import { BrowserService } from '../services/browserService'; // Import BrowserService
import { PerformanceMonitor } from '../utils/performance';
import crypto from 'crypto';

/**
 * Represents the structure of scraped data
 */
export interface ScrapedData {
  url: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

/**
 * Generate a cache key for a URL
 *
 * @param url - The URL to generate a cache key for
 * @returns Cache key
 */
function generateCacheKey(url: string): string {
  return `scrape_${crypto.createHash('md5').update(url).digest('hex')}`;
}

/**
 * Scrapes the content from a given URL
 *
 * @param url - The URL to scrape
 * @param options - Scraping options
 * @param userId - Optional ID of the user initiating the scrape (for DB association)
 * @returns Promise resolving to the scraped data
 */
export async function scrapeUrl(
  url: string,
  options: {
    useCache?: boolean;
    useCookies?: boolean;
    cacheTtl?: number;
    timeout?: number;
    retries?: number;
    useBrowser?: boolean;
    browserType?: 'desktop' | 'mobile'; // Add browserType option
  } = {},
  userId: string | null = null, // Add userId parameter
): Promise<ScrapedData> {
  return PerformanceMonitor.measure(
    'scrape_total',
    async () => {
      // Default options
      const {
        useCache = true,
        cacheTtl,
        useCookies = false,
        timeout = 10000, // Default timeout for HTTP client
        retries = 3,
        useBrowser = false, // Default to false
        browserType, // Add browserType to destructuring
      } = options;

      // Generate cache key
      const cacheKey = generateCacheKey(url);

      // Check cache if enabled
      if (useCache) {
        const cachedData = CacheService.get<ScrapedData>(cacheKey);
        if (cachedData) {
          logger.info({ message: 'Serving from cache', url });
          return cachedData;
        }
      }

      // Execute the scraping task within the request pool
      return requestPool.add(async () => {
        try {
          logger.info({ message: 'Starting scrape', url, useBrowser });

          let html: string;

          if (useBrowser) {
            // Use BrowserService for JS-heavy sites
            html = await PerformanceMonitor.measure(
              'scrape_browser_fetch',
              () =>
                BrowserService.scrapeWithBrowser(url, {
                  ...(browserType ? { browserType } : {}),
                  // Add any other browser-specific options here
                }),
              { url },
            );
          } else {
            // Use standard HTTP client
            const client =
              timeout !== 10000 || retries !== 3
                ? createHttpClient({ timeout, retries })
                : httpClient;

            // Attach cookies if requested
            const headersConfig: Record<string, string> = {};
            if (useCookies) {
              const domain = new URL(url).hostname;
              const cookieRec = await (prisma as any).cookie.findUnique({
                where: { domain_userId: { domain, userId: userId ?? null } },
              });
              if (cookieRec) headersConfig['Cookie'] = cookieRec.cookieString;
            }
            const response = await PerformanceMonitor.measure(
              'scrape_http_fetch',
              () => client.get(url, { headers: headersConfig }),
              { url },
            );
            html = response.data;
          }

          // Parse HTML with performance monitoring
          // Wrap synchronous cheerio.load in Promise.resolve
          const $ = await PerformanceMonitor.measure<cheerio.CheerioAPI>( // Add explicit type
            'scrape_parse',
            async () => cheerio.load(html), // Use async
            { url },
          );

          // Extract title
          const title = $('title').text().trim() || 'No title found';

          // Extract main content using optimized extractor with performance monitoring
          // Wrap synchronous extractMainContent in Promise.resolve
          const content = await PerformanceMonitor.measure<string>( // Add explicit type
            'scrape_extract_content',
            async () => extractMainContent(html), // Use async
            { url },
          );

          // Extract metadata with performance monitoring
          // Wrap synchronous extractMetadata in Promise.resolve
          const metadata = await PerformanceMonitor.measure<Record<string, unknown>>( // Add explicit type
            'scrape_extract_metadata',
            async () => extractMetadata($), // Use async
            { url },
          );

          // Extract links with performance monitoring
          // Wrap synchronous extractLinks in Promise.resolve
          const links = await PerformanceMonitor.measure<{ href: string; text: string }[]>( // Add explicit type
            'scrape_extract_links',
            async () => extractLinks($), // Use async
            { url },
          );

          // Create timestamp
          const timestamp = new Date().toISOString();

          // Construct the result
          const scrapedData: ScrapedData = {
            url,
            title,
            content,
            metadata: {
              ...metadata,
              links,
            },
            timestamp,
          };

          // Store in cache with performance monitoring
          if (useCache) {
            await PerformanceMonitor.measure(
              'scrape_cache',
              // Wrap synchronous CacheService.set and add missing commas
              async () => CacheService.set(cacheKey, scrapedData, cacheTtl), // Use async and fix commas
              { url },
            );
          }

          // Store in database with performance monitoring, passing userId
          await PerformanceMonitor.measure(
            'scrape_db',
            () => storeScrapedData(scrapedData, userId), // Pass userId here
            { url },
          );

          return scrapedData;
        } catch (error) {
          logger.error({
            message: 'Scrape failed',
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });

          if (error instanceof Error) {
            throw new Error(`Failed to scrape URL (${url}): ${error.message}`);
          }
          throw new Error(`Failed to scrape URL (${url}): Unknown error`);
        }
      });
    },
    { url },
  );
}

/**
 * Stores the scraped data in the database, associating it with a user.
 *
 * @param data - The scraped data to store
 * @param userId - The ID of the user associated with this scrape (can be null)
 */
async function storeScrapedData(data: ScrapedData, userId: string | null): Promise<void> {
  // Ensure userId is not undefined, default to null if necessary
  const finalUserId = userId === undefined ? null : userId;

  try {
    await prisma.scrapedPage.upsert({
      where: { url: data.url },
      update: {
        title: data.title,
        content: data.content,
        metadata: JSON.stringify(data.metadata),
        updatedAt: new Date(),
      },
      create: {
        url: data.url,
        title: data.title,
        content: data.content,
        metadata: JSON.stringify(data.metadata),
        userId: finalUserId, // Associate with user on creation
      },
    });

    logger.info({
      message: 'Saved to database',
      url: data.url,
    });
  } catch (error) {
    logger.error({
      message: 'Database storage error',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
