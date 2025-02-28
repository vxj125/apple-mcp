#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import contacts from "./utils/contacts";
import notes from "./utils/notes";
import message from "./utils/message";
import mail from "./utils/mail";
import reminders from "./utils/reminders";
import { runAppleScript } from "run-applescript";

const CONTACTS_TOOL: Tool = {
  name: "contacts",
  description: "Search and retrieve contacts from Apple Contacts app",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name to search for (optional - if not provided, returns all contacts). Can be partial name to search."
      }
    }
  }
};

const NOTES_TOOL: Tool = {
  name: "notes", 
  description: "Search and retrieve notes from Apple Notes app",
  inputSchema: {
    type: "object",
    properties: {
      searchText: {
        type: "string",
        description: "Text to search for in notes (optional - if not provided, returns all notes)"
      }
    }
  }
};

const MESSAGES_TOOL: Tool = {
  name: "messages",
  description: "Interact with Apple Messages app - send, read, schedule messages and check unread messages",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'send', 'read', 'schedule', or 'unread'",
        enum: ["send", "read", "schedule", "unread"]
      },
      phoneNumber: {
        type: "string",
        description: "Phone number to send message to (required for send, read, and schedule operations)"
      },
      message: {
        type: "string",
        description: "Message to send (required for send and schedule operations)"
      },
      limit: {
        type: "number",
        description: "Number of messages to read (optional, for read and unread operations)"
      },
      scheduledTime: {
        type: "string",
        description: "ISO string of when to send the message (required for schedule operation)"
      }
    },
    required: ["operation"]
  }
};

const MAIL_TOOL: Tool = {
  name: "mail",
  description: "Interact with Apple Mail app - read unread emails, search emails, and send emails",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'unread', 'search', 'send', 'mailboxes', or 'accounts'",
        enum: ["unread", "search", "send", "mailboxes", "accounts"]
      },
      account: {
        type: "string",
        description: "Email account to use (optional - if not provided, searches across all accounts)"
      },
      mailbox: {
        type: "string",
        description: "Mailbox to use (optional - if not provided, uses inbox or searches across all mailboxes)"
      },
      limit: {
        type: "number",
        description: "Number of emails to retrieve (optional, for unread and search operations)"
      },
      searchTerm: {
        type: "string",
        description: "Text to search for in emails (required for search operation)"
      },
      to: {
        type: "string",
        description: "Recipient email address (required for send operation)"
      },
      subject: {
        type: "string",
        description: "Email subject (required for send operation)"
      },
      body: {
        type: "string",
        description: "Email body content (required for send operation)"
      },
      cc: {
        type: "string",
        description: "CC email address (optional for send operation)"
      },
      bcc: {
        type: "string",
        description: "BCC email address (optional for send operation)"
      }
    },
    required: ["operation"]
  }
};

const REMINDERS_TOOL: Tool = {
  name: "reminders",
  description: "Search, create, and open reminders in Apple Reminders app",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'list', 'search', 'open', 'create', or 'listById'",
        enum: ["list", "search", "open", "create", "listById"]
      },
      searchText: {
        type: "string",
        description: "Text to search for in reminders (required for search and open operations)"
      },
      name: {
        type: "string",
        description: "Name of the reminder to create (required for create operation)"
      },
      listName: {
        type: "string",
        description: "Name of the list to create the reminder in (optional for create operation)"
      },
      listId: {
        type: "string",
        description: "ID of the list to get reminders from (required for listById operation)"
      },
      props: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Properties to include in the reminders (optional for listById operation)"
      },
      notes: {
        type: "string",
        description: "Additional notes for the reminder (optional for create operation)"
      },
      dueDate: {
        type: "string",
        description: "Due date for the reminder in ISO format (optional for create operation)"
      }
    },
    required: ["operation"]
  }
};

const server = new Server(
  {
    name: "Apple MCP tools",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function isContactsArgs(args: unknown): args is { name?: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    (!("name" in args) || typeof (args as { name: string }).name === "string")
  );
}

function isNotesArgs(args: unknown): args is { searchText?: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    (!("searchText" in args) || typeof (args as { searchText: string }).searchText === "string")
  );
}

function isMessagesArgs(args: unknown): args is {
  operation: "send" | "read" | "schedule" | "unread";
  phoneNumber?: string;
  message?: string;
  limit?: number;
  scheduledTime?: string;
} {
  if (typeof args !== "object" || args === null) return false;
  
  const { operation, phoneNumber, message, limit, scheduledTime } = args as any;
  
  if (!operation || !["send", "read", "schedule", "unread"].includes(operation)) {
    return false;
  }
  
  // Validate required fields based on operation
  switch (operation) {
    case "send":
    case "schedule":
      if (!phoneNumber || !message) return false;
      if (operation === "schedule" && !scheduledTime) return false;
      break;
    case "read":
      if (!phoneNumber) return false;
      break;
    case "unread":
      // No additional required fields
      break;
  }
  
  // Validate field types if present
  if (phoneNumber && typeof phoneNumber !== "string") return false;
  if (message && typeof message !== "string") return false;
  if (limit && typeof limit !== "number") return false;
  if (scheduledTime && typeof scheduledTime !== "string") return false;
  
  return true;
}

function isMailArgs(args: unknown): args is {
  operation: "unread" | "search" | "send" | "mailboxes" | "accounts";
  account?: string;
  mailbox?: string;
  limit?: number;
  searchTerm?: string;
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
} {
  if (typeof args !== "object" || args === null) return false;
  
  const { operation, account, mailbox, limit, searchTerm, to, subject, body, cc, bcc } = args as any;
  
  if (!operation || !["unread", "search", "send", "mailboxes", "accounts"].includes(operation)) {
    return false;
  }
  
  // Validate required fields based on operation
  switch (operation) {
    case "search":
      if (!searchTerm || typeof searchTerm !== "string") return false;
      break;
    case "send":
      if (!to || typeof to !== "string" || 
          !subject || typeof subject !== "string" || 
          !body || typeof body !== "string") return false;
      break;
    case "unread":
    case "mailboxes":
    case "accounts":
      // No additional required fields
      break;
  }
  
  // Validate field types if present
  if (account && typeof account !== "string") return false;
  if (mailbox && typeof mailbox !== "string") return false;
  if (limit && typeof limit !== "number") return false;
  if (cc && typeof cc !== "string") return false;
  if (bcc && typeof bcc !== "string") return false;
  
  return true;
}

function isRemindersArgs(args: unknown): args is {
  operation: "list" | "search" | "open" | "create" | "listById";
  searchText?: string;
  name?: string;
  listName?: string;
  listId?: string;
  props?: string[];
  notes?: string;
  dueDate?: string;
} {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const { operation } = args as any;
  if (typeof operation !== "string") {
    return false;
  }

  if (!["list", "search", "open", "create", "listById"].includes(operation)) {
    return false;
  }

  // For search and open operations, searchText is required
  if ((operation === "search" || operation === "open") && 
      (typeof (args as any).searchText !== "string" || (args as any).searchText === "")) {
    return false;
  }

  // For create operation, name is required
  if (operation === "create" && 
      (typeof (args as any).name !== "string" || (args as any).name === "")) {
    return false;
  }
  
  // For listById operation, listId is required
  if (operation === "listById" && 
      (typeof (args as any).listId !== "string" || (args as any).listId === "")) {
    return false;
  }

  return true;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [CONTACTS_TOOL, NOTES_TOOL, MESSAGES_TOOL, MAIL_TOOL, REMINDERS_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "contacts": {
        if (!isContactsArgs(args)) {
          throw new Error("Invalid arguments for contacts tool");
        }

        try {
          if (args.name) {
            const numbers = await contacts.findNumber(args.name);
            return {
              content: [{
                type: "text",
                text: numbers.length ? 
                  `${args.name}: ${numbers.join(", ")}` :
                  `No contact found for "${args.name}". Try a different name or use no name parameter to list all contacts.`
              }],
              isError: false
            };
          } else {
            const allNumbers = await contacts.getAllNumbers();
            const contactCount = Object.keys(allNumbers).length;
            
            if (contactCount === 0) {
              return {
                content: [{
                  type: "text",
                  text: "No contacts found in the address book. Please make sure you have granted access to Contacts."
                }],
                isError: false
              };
            }

            const formattedContacts = Object.entries(allNumbers)
              .filter(([_, phones]) => phones.length > 0)
              .map(([name, phones]) => `${name}: ${phones.join(", ")}`);

            return {
              content: [{
                type: "text",
                text: formattedContacts.length > 0 ?
                  `Found ${contactCount} contacts:\n\n${formattedContacts.join("\n")}` :
                  "Found contacts but none have phone numbers. Try searching by name to see more details."
              }],
              isError: false
            };
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error accessing contacts: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }

      case "notes": {
        if (!isNotesArgs(args)) {
          throw new Error("Invalid arguments for notes tool");
        }

        if (args.searchText) {
          const foundNotes = await notes.findNote(args.searchText);
          return {
            content: [{
              type: "text",
              text: foundNotes.length ?
                foundNotes.map(note => `${note.name}:\n${note.content}`).join("\n\n") :
                `No notes found for "${args.searchText}"`
            }],
            isError: false
          };
        } else {
          const allNotes = await notes.getAllNotes();
          return {
            content: [{
              type: "text",
              text: Object.entries(allNotes)
                .map(([name, content]) => `${name}:\n${content}`)
                .join("\n\n")
            }],
            isError: false
          };
        }
      }

      case "messages": {
        if (!isMessagesArgs(args)) {
          throw new Error("Invalid arguments for messages tool");
        }

        switch (args.operation) {
          case "send": {
            if (!args.phoneNumber || !args.message) {
              throw new Error("Phone number and message are required for send operation");
            }
            await message.sendMessage(args.phoneNumber, args.message);
            return {
              content: [{ type: "text", text: `Message sent to ${args.phoneNumber}` }],
              isError: false
            };
          }

          case "read": {
            if (!args.phoneNumber) {
              throw new Error("Phone number is required for read operation");
            }
            const messages = await message.readMessages(args.phoneNumber, args.limit);
            return {
              content: [{ 
                type: "text", 
                text: messages.length > 0 ? 
                  messages.map(msg => 
                    `[${new Date(msg.date).toLocaleString()}] ${msg.is_from_me ? 'Me' : msg.sender}: ${msg.content}`
                  ).join("\n") :
                  "No messages found"
              }],
              isError: false
            };
          }

          case "schedule": {
            if (!args.phoneNumber || !args.message || !args.scheduledTime) {
              throw new Error("Phone number, message, and scheduled time are required for schedule operation");
            }
            const scheduledMsg = await message.scheduleMessage(
              args.phoneNumber,
              args.message,
              new Date(args.scheduledTime)
            );
            return {
              content: [{ 
                type: "text", 
                text: `Message scheduled to be sent to ${args.phoneNumber} at ${scheduledMsg.scheduledTime}` 
              }],
              isError: false
            };
          }

          case "unread": {
            const messages = await message.getUnreadMessages(args.limit);
            
            // Look up contact names for all messages
            const messagesWithNames = await Promise.all(
              messages.map(async msg => {
                // Only look up names for messages not from me
                if (!msg.is_from_me) {
                  const contactName = await contacts.findContactByPhone(msg.sender);
                  return {
                    ...msg,
                    displayName: contactName || msg.sender // Use contact name if found, otherwise use phone/email
                  };
                }
                return {
                  ...msg,
                  displayName: 'Me'
                };
              })
            );

            return {
              content: [{ 
                type: "text", 
                text: messagesWithNames.length > 0 ? 
                  `Found ${messagesWithNames.length} unread message(s):\n` +
                  messagesWithNames.map(msg => 
                    `[${new Date(msg.date).toLocaleString()}] From ${msg.displayName}:\n${msg.content}`
                  ).join("\n\n") :
                  "No unread messages found"
              }],
              isError: false
            };
          }

          default:
            throw new Error(`Unknown operation: ${args.operation}`);
        }
      }

      case "mail": {
        if (!isMailArgs(args)) {
          throw new Error("Invalid arguments for mail tool");
        }

        try {
          switch (args.operation) {
            case "unread": {
              // If an account is specified, we'll try to search specifically in that account
              let emails;
              if (args.account) {
                console.log(`Getting unread emails for account: ${args.account}`);
                // Use AppleScript to get unread emails from specific account
                const script = `
tell application "Mail"
    set resultList to {}
    try
        set targetAccount to first account whose name is "${args.account.replace(/"/g, '\\"')}"
        
        -- Get mailboxes for this account
        set acctMailboxes to every mailbox of targetAccount
        
        -- If mailbox is specified, only search in that mailbox
        set mailboxesToSearch to acctMailboxes
        ${args.mailbox ? `
        set mailboxesToSearch to {}
        repeat with mb in acctMailboxes
            if name of mb is "${args.mailbox.replace(/"/g, '\\"')}" then
                set mailboxesToSearch to {mb}
                exit repeat
            end if
        end repeat
        ` : ''}
        
        -- Search specified mailboxes
        repeat with mb in mailboxesToSearch
            try
                set unreadMessages to (messages of mb whose read status is false)
                if (count of unreadMessages) > 0 then
                    set msgLimit to ${args.limit || 10}
                    if (count of unreadMessages) < msgLimit then
                        set msgLimit to (count of unreadMessages)
                    end if
                    
                    repeat with i from 1 to msgLimit
                        try
                            set currentMsg to item i of unreadMessages
                            set msgData to {subject:(subject of currentMsg), sender:(sender of currentMsg), ¬
                                        date:(date sent of currentMsg) as string, mailbox:(name of mb)}
                            
                            -- Try to get content if possible
                            try
                                set msgContent to content of currentMsg
                                if length of msgContent > 500 then
                                    set msgContent to (text 1 thru 500 of msgContent) & "..."
                                end if
                                set msgData to msgData & {content:msgContent}
                            on error
                                set msgData to msgData & {content:"[Content not available]"}
                            end try
                            
                            set end of resultList to msgData
                        on error
                            -- Skip problematic messages
                        end try
                    end repeat
                    
                    if (count of resultList) ≥ ${args.limit || 10} then exit repeat
                end if
            on error
                -- Skip problematic mailboxes
            end try
        end repeat
    on error errMsg
        return "Error: " & errMsg
    end try
    
    return resultList
end tell`;
                
                try {
                  const asResult = await runAppleScript(script);
                  if (asResult && asResult.startsWith('Error:')) {
                    throw new Error(asResult);
                  }
                  
                  // Parse the results - similar to general getUnreadMails
                  const emailData = [];
                  const matches = asResult.match(/\{([^}]+)\}/g);
                  if (matches && matches.length > 0) {
                    for (const match of matches) {
                      try {
                        const props = match.substring(1, match.length - 1).split(',');
                        const email: any = {};
                        
                        props.forEach(prop => {
                          const parts = prop.split(':');
                          if (parts.length >= 2) {
                            const key = parts[0].trim();
                            const value = parts.slice(1).join(':').trim();
                            email[key] = value;
                          }
                        });
                        
                        if (email.subject || email.sender) {
                          emailData.push({
                            subject: email.subject || "No subject",
                            sender: email.sender || "Unknown sender",
                            dateSent: email.date || new Date().toString(),
                            content: email.content || "[Content not available]",
                            isRead: false,
                            mailbox: `${args.account} - ${email.mailbox || "Unknown"}`
                          });
                        }
                      } catch (parseError) {
                        console.error('Error parsing email match:', parseError);
                      }
                    }
                  }
                  
                  emails = emailData;
                } catch (error) {
                  console.error('Error getting account-specific emails:', error);
                  // Fallback to general method if specific account fails
                  emails = await mail.getUnreadMails(args.limit);
                }
              } else {
                // No account specified, use the general method
                emails = await mail.getUnreadMails(args.limit);
              }
              
              return {
                content: [{ 
                  type: "text", 
                  text: emails.length > 0 ? 
                    `Found ${emails.length} unread email(s)${args.account ? ` in account "${args.account}"` : ''}${args.mailbox ? ` and mailbox "${args.mailbox}"` : ''}:\n\n` +
                    emails.map(email => 
                      `[${email.dateSent}] From: ${email.sender}\nMailbox: ${email.mailbox}\nSubject: ${email.subject}\n${email.content.substring(0, 200)}${email.content.length > 200 ? '...' : ''}`
                    ).join("\n\n") :
                    `No unread emails found${args.account ? ` in account "${args.account}"` : ''}${args.mailbox ? ` and mailbox "${args.mailbox}"` : ''}`
                }],
                isError: false
              };
            }

            case "search": {
              if (!args.searchTerm) {
                throw new Error("Search term is required for search operation");
              }
              
              // If account is specified, try to search in that account
              let emails;
              if (args.account) {
                console.log(`Searching emails in account "${args.account}" for "${args.searchTerm}"`);
                // Use AppleScript to search in specific account
                const script = `
tell application "Mail"
    set resultList to {}
    try
        set targetAccount to first account whose name is "${args.account.replace(/"/g, '\\"')}"
        set searchString to "${args.searchTerm.replace(/"/g, '\\"')}"
        
        -- Get mailboxes for this account
        set acctMailboxes to every mailbox of targetAccount
        
        -- If mailbox is specified, only search in that mailbox
        set mailboxesToSearch to acctMailboxes
        ${args.mailbox ? `
        set mailboxesToSearch to {}
        repeat with mb in acctMailboxes
            if name of mb is "${args.mailbox.replace(/"/g, '\\"')}" then
                set mailboxesToSearch to {mb}
                exit repeat
            end if
        end repeat
        ` : ''}
        
        -- Search specified mailboxes
        repeat with mb in mailboxesToSearch
            try
                set foundMessages to (messages of mb whose (subject contains searchString) or (content contains searchString))
                if (count of foundMessages) > 0 then
                    set msgLimit to ${args.limit || 10}
                    if (count of foundMessages) < msgLimit then
                        set msgLimit to (count of foundMessages)
                    end if
                    
                    repeat with i from 1 to msgLimit
                        try
                            set currentMsg to item i of foundMessages
                            set msgData to {subject:(subject of currentMsg), sender:(sender of currentMsg), ¬
                                        date:(date sent of currentMsg) as string, mailbox:(name of mb)}
                            
                            -- Try to get content if possible
                            try
                                set msgContent to content of currentMsg
                                if length of msgContent > 500 then
                                    set msgContent to (text 1 thru 500 of msgContent) & "..."
                                end if
                                set msgData to msgData & {content:msgContent}
                            on error
                                set msgData to msgData & {content:"[Content not available]"}
                            end try
                            
                            set end of resultList to msgData
                        on error
                            -- Skip problematic messages
                        end try
                    end repeat
                    
                    if (count of resultList) ≥ ${args.limit || 10} then exit repeat
                end if
            on error
                -- Skip problematic mailboxes
            end try
        end repeat
    on error errMsg
        return "Error: " & errMsg
    end try
    
    return resultList
end tell`;
                
                try {
                  const asResult = await runAppleScript(script);
                  if (asResult && asResult.startsWith('Error:')) {
                    throw new Error(asResult);
                  }
                  
                  // Parse the results
                  const emailData = [];
                  const matches = asResult.match(/\{([^}]+)\}/g);
                  if (matches && matches.length > 0) {
                    for (const match of matches) {
                      try {
                        const props = match.substring(1, match.length - 1).split(',');
                        const email: any = {};
                        
                        props.forEach(prop => {
                          const parts = prop.split(':');
                          if (parts.length >= 2) {
                            const key = parts[0].trim();
                            const value = parts.slice(1).join(':').trim();
                            email[key] = value;
                          }
                        });
                        
                        if (email.subject || email.sender) {
                          emailData.push({
                            subject: email.subject || "No subject",
                            sender: email.sender || "Unknown sender",
                            dateSent: email.date || new Date().toString(),
                            content: email.content || "[Content not available]",
                            isRead: false,
                            mailbox: `${args.account} - ${email.mailbox || "Unknown"}`
                          });
                        }
                      } catch (parseError) {
                        console.error('Error parsing email match:', parseError);
                      }
                    }
                  }
                  
                  emails = emailData;
                } catch (error) {
                  console.error('Error searching account-specific emails:', error);
                  // Fallback to general method if specific account fails
                  emails = await mail.searchMails(args.searchTerm, args.limit);
                }
              } else {
                // No account specified, use the general method
                emails = await mail.searchMails(args.searchTerm, args.limit);
              }
              
              return {
                content: [{ 
                  type: "text", 
                  text: emails.length > 0 ? 
                    `Found ${emails.length} email(s) for "${args.searchTerm}"${args.account ? ` in account "${args.account}"` : ''}${args.mailbox ? ` and mailbox "${args.mailbox}"` : ''}:\n\n` +
                    emails.map(email => 
                      `[${email.dateSent}] From: ${email.sender}\nMailbox: ${email.mailbox}\nSubject: ${email.subject}\n${email.content.substring(0, 200)}${email.content.length > 200 ? '...' : ''}`
                    ).join("\n\n") :
                    `No emails found for "${args.searchTerm}"${args.account ? ` in account "${args.account}"` : ''}${args.mailbox ? ` and mailbox "${args.mailbox}"` : ''}`
                }],
                isError: false
              };
            }

            case "send": {
              if (!args.to || !args.subject || !args.body) {
                throw new Error("Recipient (to), subject, and body are required for send operation");
              }
              
              // If account is specified, try to send from that account
              if (args.account) {
                console.log(`Sending email from account "${args.account}"`);
                // Use AppleScript to send from specific account
                const script = `
tell application "Mail"
    try
        set targetAccount to first account whose name is "${args.account.replace(/"/g, '\\"')}"
        set newMessage to make new outgoing message with properties {subject:"${args.subject.replace(/"/g, '\\"')}", content:"${args.body.replace(/"/g, '\\"')}", visible:true}
        
        -- Set the account for sending
        tell newMessage
            set sender to email address of targetAccount
            make new to recipient with properties {address:"${args.to.replace(/"/g, '\\"')}"}
            ${args.cc ? `make new cc recipient with properties {address:"${args.cc.replace(/"/g, '\\"')}"}` : ''}
            ${args.bcc ? `make new bcc recipient with properties {address:"${args.bcc.replace(/"/g, '\\"')}"}` : ''}
        end tell
        
        send newMessage
        return "success"
    on error errMsg
        return "Error: " & errMsg
    end try
end tell`;
                
                try {
                  const asResult = await runAppleScript(script);
                  if (asResult && asResult.startsWith('Error:')) {
                    throw new Error(asResult);
                  }
                  
                  return {
                    content: [{ type: "text", text: `Email sent from account "${args.account}" to ${args.to} with subject "${args.subject}"` }],
                    isError: false
                  };
                } catch (error) {
                  console.error('Error sending from specific account:', error);
                  // Fallback to general send method
                  const result = await mail.sendMail(args.to, args.subject, args.body, args.cc, args.bcc);
                  return {
                    content: [{ type: "text", text: result }],
                    isError: false
                  };
                }
              } else {
                // No account specified, use the general method
                const result = await mail.sendMail(args.to, args.subject, args.body, args.cc, args.bcc);
                return {
                  content: [{ type: "text", text: result }],
                  isError: false
                };
              }
            }

            case "mailboxes": {
              if (args.account) {
                // Get mailboxes for specific account
                const mailboxes = await mail.getMailboxesForAccount(args.account);
                return {
                  content: [{ 
                    type: "text", 
                    text: mailboxes.length > 0 ? 
                      `Found ${mailboxes.length} mailboxes for account "${args.account}":\n\n${mailboxes.join("\n")}` :
                      `No mailboxes found for account "${args.account}". Make sure the account name is correct.`
                  }],
                  isError: false
                };
              } else {
                // Get all mailboxes
                const mailboxes = await mail.getMailboxes();
                return {
                  content: [{ 
                    type: "text", 
                    text: mailboxes.length > 0 ? 
                      `Found ${mailboxes.length} mailboxes:\n\n${mailboxes.join("\n")}` :
                      "No mailboxes found. Make sure Mail app is running and properly configured."
                  }],
                  isError: false
                };
              }
            }
            
            case "accounts": {
              const accounts = await mail.getAccounts();
              return {
                content: [{ 
                  type: "text", 
                  text: accounts.length > 0 ? 
                    `Found ${accounts.length} email accounts:\n\n${accounts.join("\n")}` :
                    "No email accounts found. Make sure Mail app is configured with at least one account."
                }],
                isError: false
              };
            }

            default:
              throw new Error(`Unknown operation: ${args.operation}`);
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error with mail operation: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }

      case "reminders": {
        if (!isRemindersArgs(args)) {
          throw new Error("Invalid arguments for reminders tool");
        }

        try {
          const { operation } = args;

          if (operation === "list") {
            // List all reminders
            const lists = await reminders.getAllLists();
            const allReminders = await reminders.getAllReminders();
            return {
              content: [{
                type: "text",
                text: `Found ${lists.length} lists and ${allReminders.length} reminders.`
              }],
              lists,
              reminders: allReminders,
              isError: false
            };
          } 
          else if (operation === "search") {
            // Search for reminders
            const { searchText } = args;
            const results = await reminders.searchReminders(searchText!);
            return {
              content: [{
                type: "text",
                text: results.length > 0 
                  ? `Found ${results.length} reminders matching "${searchText}".` 
                  : `No reminders found matching "${searchText}".`
              }],
              reminders: results,
              isError: false
            };
          } 
          else if (operation === "open") {
            // Open a reminder
            const { searchText } = args;
            const result = await reminders.openReminder(searchText!);
            return {
              content: [{
                type: "text",
                text: result.success 
                  ? `Opened Reminders app. Found reminder: ${result.reminder?.name}` 
                  : result.message
              }],
              ...result,
              isError: !result.success
            };
          } 
          else if (operation === "create") {
            // Create a reminder
            const { name, listName, notes, dueDate } = args;
            const result = await reminders.createReminder(name!, listName, notes, dueDate);
            return {
              content: [{
                type: "text",
                text: `Created reminder "${result.name}" ${listName ? `in list "${listName}"` : ''}.`
              }],
              success: true,
              reminder: result,
              isError: false
            };
          }
          else if (operation === "listById") {
            // Get reminders from a specific list by ID
            const { listId, props } = args;
            const results = await reminders.getRemindersFromListById(listId!, props);
            return {
              content: [{
                type: "text",
                text: results.length > 0 
                  ? `Found ${results.length} reminders in list with ID "${listId}".` 
                  : `No reminders found in list with ID "${listId}".`
              }],
              reminders: results,
              isError: false
            };
          }

          return {
            content: [{
              type: "text",
              text: "Unknown operation"
            }],
            isError: true
          };
        } catch (error) {
          console.error("Error in reminders tool:", error);
          return {
            content: [{
              type: "text",
              text: `Error in reminders tool: ${error}`
            }],
            isError: true
          };
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

(async () => {
  try {
    const transport = new StdioServerTransport();

    // Ensure stdout is only used for JSON messages
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
      // Only allow JSON messages to pass through
      if (typeof chunk === "string" && !chunk.startsWith("{")) {
        return true; // Silently skip non-JSON messages
      }
      return originalStdoutWrite(chunk, encoding, callback);
    };

    await server.connect(transport);
  } catch (error) {
    console.error("Failed to initialize MCP server:", error);
    process.exit(1);
  }
})();