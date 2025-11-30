// ============================================
// CONFIG.JS - Configuration Module
// ============================================
const config = {
  files: {
    contacts: "adegas.txt",
    image: "ad3g4.png",
    log: "logs/whatsapp-automation.log",
    state: "state/progress.json",
  },

  timing: {
    minDelayMs: 30000, // 30 seconds (INCREASED)
    maxDelayMs: 90000, // 90 seconds (INCREASED)
    scanTimeout: 120000, // 2 minutes for QR scan
    actionTimeout: 10000, // 10s for actions
    retryDelay: 5000, // 5s between retries
  },

  behavior: {
    maxRetries: 3,
    enableMouseMovements: true,
    enableTypingVariation: true,
    pauseAfterErrors: 10000,
  },

  captions: [
    "Olá! Sua adega com mais controle por um valor justo. Quer saber mais?",
    "Oi! Que tal ter controle total da sua adega por um preço acessível?",
    "Ei! Sistema completo para gestão de adegas. Posso te contar mais?",
    "Tudo bem? Tenho uma solução interessante para adegas. Te interessa?",
    "Opa! Controle profissional para sua adega. Vamos conversar?",
    "Olá! Gestão inteligente de adegas com ótimo custo-benefício.",
    "Oi! Sua adega merece um sistema de controle eficiente. Que tal?",
  ],

  selectors: {
    qrReady: "div#side",
    newChat: [
      'span[data-icon="new-chat-outline"]',
      'button[aria-label="Nova conversa"]',
    ],
    searchBox: [
      'input[title="Pesquisar ou começar uma nova conversa"]',
      'div[contenteditable="true"][data-tab="3"]',
    ],
    chatInput: 'div[contenteditable="true"][data-tab]',
    attachButton: [
      'button[aria-label="Anexar"]',
      'button[data-testid="attach-menu-button"]',
      'span[data-icon="plus-rounded"]',
      'span[data-icon="plus"]',
    ],
    fileInput: 'input[type="file"][accept*="image"]',
    captionInput: 'div[data-lexical-editor="true"][contenteditable="true"]',
    sendButton: [
      'div[aria-label="Enviar"]',
      'button[aria-label="Enviar"]',
      'span[data-icon="send"]',
    ],
  },
};

// ============================================
// UTILS.JS - Utility Functions
// ============================================
const fs = require("fs");
const path = require("path");

class Logger {
  constructor(logFile) {
    this.logFile = logFile;
    this.ensureLogDir();
  }

  ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
    };

    const consoleMsg = `[${timestamp}] [${level}] ${message}`;
    console.log(consoleMsg);

    try {
      fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + "\n", "utf-8");
    } catch (err) {
      console.error("Failed to write log:", err.message);
    }
  }

  info(message, data) {
    this.log("INFO", message, data);
  }
  warn(message, data) {
    this.log("WARN", message, data);
  }
  error(message, data) {
    this.log("ERROR", message, data);
  }
  debug(message, data) {
    this.log("DEBUG", message, data);
  }
}

class StateManager {
  constructor(stateFile) {
    this.stateFile = stateFile;
    this.state = this.load();
  }

  load() {
    try {
      const dir = path.dirname(this.stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, "utf-8");
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn("Could not load state:", err.message);
    }

    return {
      processed: [],
      failed: [],
      lastRun: null,
    };
  }

  save() {
    try {
      fs.writeFileSync(
        this.stateFile,
        JSON.stringify(this.state, null, 2),
        "utf-8"
      );
    } catch (err) {
      console.error("Failed to save state:", err.message);
    }
  }

  markProcessed(contact, success) {
    const entry = {
      contact,
      timestamp: new Date().toISOString(),
      success,
    };

    if (success) {
      this.state.processed.push(entry);
    } else {
      this.state.failed.push(entry);
    }

    this.state.lastRun = new Date().toISOString();
    this.save();
  }

  isProcessed(contact) {
    return this.state.processed.some((e) => e.contact === contact);
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHumanDelay(minMs, maxMs) {
  // 70% standard delay, 20% medium, 10% long pause
  const rand = Math.random();
  const range = maxMs - minMs;

  if (rand < 0.7) {
    return randomBetween(minMs, maxMs);
  } else if (rand < 0.9) {
    return randomBetween(maxMs, maxMs + range);
  } else {
    return randomBetween(maxMs + range, maxMs + range * 2);
  }
}

function validatePhoneNumber(phone) {
  // Remove non-digits
  const cleaned = phone.replace(/\D/g, "");

  // Check if valid length (international format)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return null;
  }

  return cleaned;
}

function loadContacts(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Contact file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const contacts = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => validatePhoneNumber(line))
    .filter((phone) => phone !== null);

  return contacts;
}

// ============================================
// BROWSER-ACTIONS.JS - Browser Automation
// ============================================
class BrowserActions {
  constructor(page, logger, config) {
    this.page = page;
    this.logger = logger;
    this.config = config;
  }

  async waitForSelector(selectors, timeout = 5000) {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorArray) {
      try {
        await this.page.waitForSelector(selector, { timeout });
        return selector;
      } catch (err) {
        // Try next selector
      }
    }

    throw new Error(`None of the selectors found: ${selectorArray.join(", ")}`);
  }

  async clickElement(selectors, timeout = 5000) {
    const selector = await this.waitForSelector(selectors, timeout);
    await this.page.click(selector);
    await sleep(randomBetween(200, 500));
    return true;
  }

  async typeHumanlike(elementHandle, text) {
    const words = text.split(" ");

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Type each character with variation
      for (const char of word) {
        const delay = randomBetween(40, 120);
        try {
          await elementHandle.type(char, { delay });
        } catch {
          await this.page.keyboard.type(char, { delay });
        }
      }

      // Pause between words (occasionally longer)
      if (i < words.length - 1) {
        const wordPause =
          Math.random() < 0.1
            ? randomBetween(400, 800)
            : randomBetween(100, 250);
        await sleep(wordPause);

        try {
          await elementHandle.type(" ", { delay: 50 });
        } catch {
          await this.page.keyboard.type(" ", { delay: 50 });
        }
      }
    }
  }

  async moveMouseNaturally() {
    if (!this.config.behavior.enableMouseMovements) return;

    try {
      const width = await this.page.evaluate(() => window.innerWidth);
      const height = await this.page.evaluate(() => window.innerHeight);

      const movements = randomBetween(1, 3);
      for (let i = 0; i < movements; i++) {
        const x = randomBetween(width * 0.2, width * 0.8);
        const y = randomBetween(height * 0.2, height * 0.8);
        const steps = randomBetween(3, 8);

        await this.page.mouse.move(x, y, { steps });
        await sleep(randomBetween(50, 150));
      }
    } catch (err) {
      this.logger.debug("Mouse movement failed", { error: err.message });
    }
  }

  async checkNoResultsFound() {
    try {
      await sleep(700);
      return await this.page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll("span"));
        return spans.some(
          (s) =>
            s.innerText?.includes("Nenhuma conversa") ||
            s.innerText?.includes("Nenhum resultado encontrado")
        );
      });
    } catch {
      return false;
    }
  }
}

// ============================================
// WHATSAPP-CLIENT.JS - Main WhatsApp Logic
// ============================================
class WhatsAppClient {
  constructor(page, logger, config) {
    this.page = page;
    this.logger = logger;
    this.config = config;
    this.actions = new BrowserActions(page, logger, config);
  }

  async openChat(phoneNumber) {
    this.logger.info(`tentando abrir o chat ${phoneNumber}`);

    try {
      // Click new chat button
      try {
        await this.actions.clickElement(this.config.selectors.newChat, 5000);
      } catch {
        this.logger.debug("New chat button not clicked, continuing...");
      }

      // Find and focus search box
      const searchSelector = await this.actions.waitForSelector(
        this.config.selectors.searchBox,
        5000
      );

      const searchBox = await this.page.$(searchSelector);
      if (!searchBox) {
        throw new Error("Search box not found");
      }

      // Clear and type phone number
      await searchBox.click({ clickCount: 3 });
      await this.page.keyboard.press("Backspace");
      await this.actions.typeHumanlike(searchBox, phoneNumber);
      await sleep(randomBetween(800, 1500));

      // Check if contact was found
      if (await this.actions.checkNoResultsFound()) {
        this.logger.warn(`Numero não encontrado: ${phoneNumber}`);
        return false;
      }

      // Click on contact card
      const cardClicked = await this.page.evaluate((phone) => {
        const items = Array.from(
          document.querySelectorAll('div[role="option"], div[role="button"]')
        );

        for (const item of items) {
          if (item.innerText && item.innerText.includes(phone)) {
            item.click();
            return true;
          }
        }
        return false;
      }, phoneNumber);

      if (!cardClicked) {
        this.logger.debug("Card not clicked, pressing Enter");
        await this.page.keyboard.press("Enter");
      }

      // Wait for chat to open
      await this.actions.waitForSelector(
        this.config.selectors.chatInput,
        this.config.timing.actionTimeout
      );

      this.logger.info("Chat opened successfully");
      return true;
    } catch (err) {
      this.logger.error(`Failed to open chat: ${err.message}`);
      throw err;
    }
  }

  async sendImage(imagePath, caption) {
    this.logger.info("Sending image with caption");

    try {
      // Click attach button
      await this.actions.clickElement(
        this.config.selectors.attachButton,
        this.config.timing.actionTimeout
      );

      // Upload file
      const fileInput = await this.page.$(this.config.selectors.fileInput);
      if (!fileInput) {
        throw new Error("File input not found");
      }

      await fileInput.uploadFile(imagePath);
      await sleep(randomBetween(800, 1500));

      // Type caption
      const captionBox = await this.actions.waitForSelector(
        this.config.selectors.captionInput,
        this.config.timing.actionTimeout
      );

      const captionElement = await this.page.$(
        this.config.selectors.captionInput
      );
      if (captionElement) {
        await this.actions.typeHumanlike(captionElement, caption);
        await sleep(randomBetween(300, 700));
      }

      // Click send button
      await this.actions.clickElement(
        this.config.selectors.sendButton,
        this.config.timing.actionTimeout
      );

      this.logger.info("Image sent successfully");
      await sleep(randomBetween(1000, 2000));

      return true;
    } catch (err) {
      this.logger.error(`Failed to send image: ${err.message}`);
      throw err;
    }
  }

  async processContact(phoneNumber, imagePath) {
    const randomCaption =
      this.config.captions[randomBetween(0, this.config.captions.length - 1)];

    // Natural mouse movement
    await this.actions.moveMouseNaturally();

    // Open chat
    const chatOpened = await this.openChat(phoneNumber);
    if (!chatOpened) {
      return false;
    }

    // Small delay before sending
    await sleep(randomBetween(500, 1200));

    // Send image
    await this.sendImage(imagePath, randomCaption);

    return true;
  }
}

// ============================================
// MAIN.JS - Application Entry Point
// ============================================
const puppeteer = require("puppeteer");

async function main() {
  const logger = new Logger(config.files.log);
  const stateManager = new StateManager(config.files.state);

  logger.info("=== WhatsApp Automation Started ===");

  // Validate image exists
  const imagePath = path.resolve(__dirname, config.files.image);
  if (!fs.existsSync(imagePath)) {
    logger.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  // Load contacts
  let contacts;
  try {
    contacts = loadContacts(config.files.contacts);
    logger.info(`Loaded ${contacts.length} contacts`);
  } catch (err) {
    logger.error(`Failed to load contacts: ${err.message}`);
    process.exit(1);
  }

  // Filter already processed contacts
  const pendingContacts = contacts.filter((c) => !stateManager.isProcessed(c));
  logger.info(`${pendingContacts.length} contacts pending`);

  if (pendingContacts.length === 0) {
    logger.info("No contacts to process. Exiting.");
    process.exit(0);
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const [page] = await browser.pages();

    // Navigate to WhatsApp
    await page.goto("https://web.whatsapp.com", {
      waitUntil: "domcontentloaded",
    });

    logger.info("Please scan QR code...");

    // Wait for QR scan
    await page.waitForSelector(config.selectors.qrReady, {
      timeout: config.timing.scanTimeout,
    });

    logger.info("WhatsApp ready. Starting automation...");
    await sleep(3000); // Initial pause

    // Initialize WhatsApp client
    const client = new WhatsAppClient(page, logger, config);

    // Process contacts
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingContacts.length; i++) {
      const contact = pendingContacts[i];
      logger.info(`Processing ${i + 1}/${pendingContacts.length}: ${contact}`);

      let attempts = 0;
      let success = false;

      while (attempts < config.behavior.maxRetries && !success) {
        try {
          await client.processContact(contact, imagePath);
          success = true;
          successCount++;
          logger.info(`✓ Contact processed: ${contact}`);
        } catch (err) {
          attempts++;
          logger.error(
            `Attempt ${attempts} failed for ${contact}: ${err.message}`
          );

          if (attempts < config.behavior.maxRetries) {
            logger.info(`Retrying in ${config.timing.retryDelay / 1000}s...`);
            await sleep(config.timing.retryDelay);
          } else {
            failCount++;
            logger.error(`✗ Failed after ${attempts} attempts: ${contact}`);
          }
        }
      }

      // Mark as processed
      stateManager.markProcessed(contact, success);

      // Human-like delay between contacts
      if (i < pendingContacts.length - 1) {
        const delayMs = getHumanDelay(
          config.timing.minDelayMs,
          config.timing.maxDelayMs
        );
        logger.info(
          `Aguardando ${Math.round(
            delayMs / 1000
          )}s Pulando para o proximo contato...`
        );
        await sleep(delayMs);
      }
    }

    // Summary
    logger.info("=== Automation Completed ===");
    logger.info(`Success: ${successCount}, Failed: ${failCount}`);
  } catch (err) {
    logger.error(`Critical error: ${err.message}`, { stack: err.stack });
  } finally {
    await browser.close();
    logger.info("Browser closed");
  }
}

// Run application
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
