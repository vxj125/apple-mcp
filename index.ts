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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [CONTACTS_TOOL, NOTES_TOOL, MESSAGES_TOOL],
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Apple MCP Server running on stdio");