import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} from '@whiskeysockets/baileys';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

/**
 * Button class to handle different button types
 */
class Button {
  constructor(buttonData) {
    this.type = buttonData.type || 'reply';
    this.displayText = buttonData.displayText || '';
    this.id = buttonData.id;
    this.url = buttonData.url;
    this.copyCode = buttonData.copyCode;
    this.phoneNumber = buttonData.phoneNumber;
    
    // Auto-generate ID for reply buttons if not provided
    if (this.type === 'reply' && !this.id) {
      this.id = uuidv4();
    }
    
    // Map button types to WhatsApp native flow types
    this.mapType = new Map([
      ['reply', 'quick_reply'],
      ['copy', 'cta_copy'],
      ['url', 'cta_url'],
      ['call', 'cta_call'],
    ]);
  }
  
  get typeButton() {
    return this.mapType.get(this.type);
  }
  
  toJSONString() {
    const stringify = (val) => JSON.stringify(val);
    
    const typeMap = {
      call: () => stringify({
        display_text: this.displayText,
        phone_number: this.phoneNumber,
      }),
      reply: () => stringify({
        display_text: this.displayText,
        id: this.id,
      }),
      copy: () => stringify({
        display_text: this.displayText,
        copy_code: this.copyCode,
      }),
      url: () => stringify({
        display_text: this.displayText,
        url: this.url,
        merchant_url: this.url,
      }),
    };
    
    return typeMap[this.type]?.() || '';
  }
}

/**
 * Generate a default placeholder image (1x1 transparent PNG)
 */
function getDefaultImage() {
  // 1x1 transparent PNG base64
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

/**
 * Format button message using carousel workaround
 * NOTE: Image is REQUIRED for buttons to work properly
 */
async function formatButtonMsg(buttons, footerText, bodyText, sock, imageUrl = null) {
  // Image is REQUIRED - use provided image or default placeholder
  let imageBuffer;
  
  if (imageUrl) {
    // If it's a file path, read it
    if (typeof imageUrl === 'string' && fs.existsSync(imageUrl)) {
      imageBuffer = fs.readFileSync(imageUrl);
    }
    // If it's already a Buffer
    else if (Buffer.isBuffer(imageUrl)) {
      imageBuffer = imageUrl;
    }
    // Otherwise use default
    else {
      console.warn('⚠️  Invalid image format. Using default placeholder.');
      imageBuffer = getDefaultImage();
    }
  } else {
    // Use default 1x1 transparent image if no image provided
    console.warn('⚠️  No image provided. Using default placeholder. For best results, provide an image URL.');
    imageBuffer = getDefaultImage();
  }
  
  // Prepare media using Baileys
  const mediaPrepared = await prepareWAMessageMedia(
    { image: imageBuffer },
    { upload: sock.waUploadToServer }
  );
  
  // Validate that media was prepared successfully
  if (!mediaPrepared?.imageMessage) {
    console.error('Media preparation failed');
    throw new Error('Failed to prepare image. Image is required for button messages to work.');
  }
  
  // Build the interactive message structure
  const interactiveMessage = {
    carouselMessage: {
      cards: [
        {
          body: {
            text: bodyText || ''
          },
          footer: { 
            text: footerText || '' 
          },
          header: {
            hasMediaAttachment: true,
            imageMessage: mediaPrepared.imageMessage,
          },
          nativeFlowMessage: {
            buttons: buttons.map((btn) => ({
              name: btn.typeButton,
              buttonParamsJson: btn.toJSONString(),
            })),
            messageParamsJson: JSON.stringify({
              from: 'api',
              templateId: uuidv4(),
            }),
          },
        },
      ],
      messageVersion: 1,
    },
  };
  
  return interactiveMessage;
}

/**
 * Send button message
 * @param {Object} sock - Baileys socket instance
 * @param {string} jid - Recipient JID (e.g., '1234567890@s.whatsapp.net')
 * @param {Array} buttons - Array of button objects
 * @param {string} message - Message text
 * @param {string} footer - Footer text (optional)
 * @param {string|Buffer} imageUrl - Image URL or Buffer (REQUIRED - will use placeholder if not provided)
 */
async function sendButtonMessage(sock, jid, buttons, message, footer = '', imageUrl = null) {
  try {
    // Validate inputs
    if (!buttons || buttons.length === 0) {
      throw new Error('At least one button is required');
    }
    
    if (buttons.length > 4) {
      throw new Error('Maximum 4 buttons allowed');
    }
    
    if (!message || message.trim() === '') {
      throw new Error('Message text is required');
    }
    
    // Convert button data to Button objects
    const buttonObjects = buttons.map(btn => new Button(btn));
    
    // Format the message (image will be added automatically if not provided)
    const interactiveMessage = await formatButtonMsg(
      buttonObjects,
      footer,
      message,
      sock,
      imageUrl
    );
    
    // Generate the message content
    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: interactiveMessage,
          },
        },
      },
      { userJid: sock.user.id }
    );
    
    // Send the message
    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
    });
    
    return {
      status: true,
      message: 'Button message sent successfully',
      data: msg
    };
  } catch (error) {
    console.error('Error sending button message:', error);
    return {
      status: false,
      message: error.message,
      error: error
    };
  }
}

export {
  Button,
  formatButtonMsg,
  sendButtonMessage,
  getDefaultImage
};
