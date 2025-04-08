/**
 * Modals Component
 * Handles all modal dialogs in the dashboard
 */

import ApiService from '../services/api-service.js';
import Navigation from './navigation.js';

/**
 * Modal elements cache
 */
const elements = {
  // New scrape modal
  newScrapeModal: null,
  scrapeCancelButton: null,
  scrapeSubmitButton: null,
  newScrapeForm: null,
  newScrapeButton: null,
  
  // New crawl modal
  newCrawlModal: null,
  crawlCancelButton: null,
  crawlSubmitButton: null,
  newCrawlForm: null,
  newCrawlButton: null
};

/**
 * Setup modals and bind events
 * @param {Object} controllers - Page controllers
 */
function setupModals(controllers) {
  cacheElements();
  bindEvents(controllers);
}

/**
 * Cache modal DOM elements
 */
function cacheElements() {
  // New scrape modal
  elements.newScrapeModal = document.getElementById('new-scrape-modal');
  elements.scrapeCancelButton = document.getElementById('scrape-cancel');
  elements.scrapeSubmitButton = document.getElementById('scrape-submit');
  elements.newScrapeForm = document.getElementById('new-scrape-form');
  elements.newScrapeButton = document.getElementById('new-scrape-button');
  
  // New crawl modal
  elements.newCrawlModal = document.getElementById('new-crawl-modal');
  elements.crawlCancelButton = document.getElementById('crawl-cancel');
  elements.crawlSubmitButton = document.getElementById('crawl-submit');
  elements.newCrawlForm = document.getElementById('new-crawl-form');
  elements.newCrawlButton = document.getElementById('new-crawl-button');
}

/**
 * Bind modal event listeners
 * @param {Object} controllers - Page controllers
 */
function bindEvents(controllers) {
  // New scrape modal
  if (elements.newScrapeButton) {
    elements.newScrapeButton.addEventListener('click', showNewScrapeModal);
  }
  
  if (elements.scrapeCancelButton) {
    elements.scrapeCancelButton.addEventListener('click', hideNewScrapeModal);
  }
  
  if (elements.scrapeSubmitButton) {
    elements.scrapeSubmitButton.addEventListener('click', () => submitNewScrape(controllers));
  }
  
  // New crawl modal
  if (elements.newCrawlButton) {
    elements.newCrawlButton.addEventListener('click', showNewCrawlModal);
  }
  
  if (elements.crawlCancelButton) {
    elements.crawlCancelButton.addEventListener('click', hideNewCrawlModal);
  }
  
  if (elements.crawlSubmitButton) {
    elements.crawlSubmitButton.addEventListener('click', () => submitNewCrawl(controllers));
  }
}

/**
 * Show new scrape modal
 */
function showNewScrapeModal() {
  if (elements.newScrapeModal) {
    elements.newScrapeModal.classList.remove('hidden');
  }
}

/**
 * Hide new scrape modal
 */
function hideNewScrapeModal() {
  if (elements.newScrapeModal) {
    elements.newScrapeModal.classList.add('hidden');
    if (elements.newScrapeForm) {
      elements.newScrapeForm.reset();
    }
  }
}

/**
 * Show new crawl modal
 */
function showNewCrawlModal() {
  if (elements.newCrawlModal) {
    elements.newCrawlModal.classList.remove('hidden');
  }
}

/**
 * Hide new crawl modal
 */
function hideNewCrawlModal() {
  if (elements.newCrawlModal) {
    elements.newCrawlModal.classList.add('hidden');
    if (elements.newCrawlForm) {
      elements.newCrawlForm.reset();
    }
  }
}

/**
 * Submit new scrape form
 * @param {Object} controllers - Page controllers
 */
async function submitNewScrape(controllers) {
  try {
    const url = document.getElementById('scrape-url').value;
    const category = document.getElementById('scrape-category').value;
    const notes = document.getElementById('scrape-notes').value;
    const useBrowser = document.getElementById('scrape-browser').checked;
    
    if (!url) {
      alert('Please enter a URL');
      return;
    }
    
    await ApiService.scrapes.createScrape({
      url,
      category,
      notes,
      useBrowser
    });
    
    hideNewScrapeModal();
    alert('Scrape job submitted successfully. Track status on the Scrape Jobs page.');
    
    // Refresh data if needed
    if (Navigation.activePage === 'dashboard') {
      controllers.dashboard.init();
    } else if (Navigation.activePage === 'jobs') {
      controllers.jobs.init();
    }
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

/**
 * Submit new crawl form
 * @param {Object} controllers - Page controllers
 */
async function submitNewCrawl(controllers) {
  try {
    const startUrl = document.getElementById('crawl-start-url').value;
    const maxDepthInput = document.getElementById('crawl-max-depth');
    const domainScope = document.getElementById('crawl-domain-scope').value;
    const useBrowser = document.getElementById('crawl-browser').checked;
    const mode = document.getElementById('crawl-mode')?.value || 'content';
    
    if (!startUrl) {
      alert('Please enter a Start URL');
      return;
    }
    
    let maxDepth = maxDepthInput.value ? parseInt(maxDepthInput.value, 10) : null;
    if (isNaN(maxDepth) || maxDepth < 0) {
      maxDepth = null;
    }
    
    await ApiService.crawlJobs.createCrawlJob({
      startUrl,
      maxDepth,
      domainScope,
      useBrowser,
      mode
    });
    
    hideNewCrawlModal();
    alert('Crawl job submitted successfully. Track status on the Crawl Jobs page.');
    
    // Navigate to crawl jobs page
    Navigation.navigateTo('crawlJobs');
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

export {
  setupModals,
  showNewScrapeModal,
  hideNewScrapeModal,
  showNewCrawlModal,
  hideNewCrawlModal
};
