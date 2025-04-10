#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { runAppleScript } from "run-applescript";
import tools from "./tools";

interface WebSearchArgs {
  query: string;
}

console.error("Starting apple-mcp server...");

// Remove the complex lazy loading logic for easier debugging.
// If startup becomes slow or problematic later, it can be revisited.
let contacts: typeof import('./utils/contacts').default | null = null;
let notes: typeof import('./utils/notes').default | null = null;
let message: typeof import('./utils/message').default | null = null;
let mail: typeof import('./utils/mail').default | null = null;
let reminders: typeof import('./utils/reminders').default | null = null;
let webSearch: typeof import('./utils/webSearch').default | null = null;
let calendar: typeof import('./utils/calendar').default | null = null;
let maps: typeof import('./utils/maps').default | null = null;

async function loadModules() {
  try {
    console.error("Attempting to eagerly load modules...");
    contacts = (await import('./utils/contacts')).default;
    console.error("- Contacts module loaded successfully");
    notes = (await import('./utils/notes')).default;
    console.error("- Notes module loaded successfully");
    message = (await import('./utils/message')).default;
    console.error("- Message module loaded successfully");
    mail = (await import('./utils/mail')).default;
    console.error("- Mail module loaded successfully");
    reminders = (await import('./utils/reminders')).default;
    console.error("- Reminders module loaded successfully");
    webSearch = (await import('./utils/webSearch')).default;
    console.error("- WebSearch module loaded successfully");
    calendar = (await import('./utils/calendar')).default;
    console.error("- Calendar module loaded successfully");
    maps = (await import('./utils/maps')).default;
    console.error("- Maps module loaded successfully");
    console.error("All modules loaded successfully.");
  } catch (error) {
      console.error("Fatal error during eager module loading:", error);
      // If modules fail to load eagerly, the server likely can't function.
      process.exit(1);
  }
}

// Main server object
let server: Server;

// Initialize the server and set up handlers
async function initServer() {
  // Ensure modules are loaded before setting up the server
  await loadModules();

  console.error(`Initializing server...`);

  const serverInfo = {
    name: "Apple MCP tools",
    version: "1.0.0",
  };

  const serverCapabilities = {
    capabilities: {
      tools: {},
      // Add other capabilities if needed, e.g., logging: { levels: ['error', 'warn', 'info', 'debug']}
    },
  };

  server = new Server(serverInfo, serverCapabilities);

  // Add Explicit Initialize Handler
  server.setRequestHandler(InitializeRequestSchema, async (request) => {
    console.error("Received and handling explicit initialize request from client.");
    // Log client info if available in the request
    if (request.params?.clientInfo) {
        console.error(`Client Info: Name=${request.params.clientInfo.name}, Version=${request.params.clientInfo.version}`);
    }
    // Return the server's capabilities and info
    return {
      ...serverInfo,
      ...serverCapabilities,
    };
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received listTools request.");
    // Ensure the 'tools' object is correctly structured as per MCP spec if needed
    // Example: return { tools: tools.map(t => ({ name: t.name, description: t.description, arguments: t.arguments })) };
    return { tools }; // Assuming 'tools' from './tools' is already correctly formatted
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.error(`Received callTool request for tool: ${request.params.name}`);
    try {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error("No arguments provided");
      }

      // Helper function for lazy module loading (kept for callTool)
      async function loadModuleForTool<T extends 'contacts' | 'notes' | 'message' | 'mail' | 'reminders' | 'webSearch' | 'calendar' | 'maps'>(moduleName: T): Promise<any> {
          switch (moduleName) {
              case 'contacts': if (!contacts) contacts = (await import('./utils/contacts')).default; return contacts;
              case 'notes': if (!notes) notes = (await import('./utils/notes')).default; return notes;
              case 'message': if (!message) message = (await import('./utils/message')).default; return message;
              case 'mail': if (!mail) mail = (await import('./utils/mail')).default; return mail;
              case 'reminders': if (!reminders) reminders = (await import('./utils/reminders')).default; return reminders;
              case 'webSearch': if (!webSearch) webSearch = (await import('./utils/webSearch')).default; return webSearch;
              case 'calendar': if (!calendar) calendar = (await import('./utils/calendar')).default; return calendar;
              case 'maps': if (!maps) maps = (await import('./utils/maps')).default; return maps;
              default: throw new Error(`Unknown module: ${moduleName}`);
          }
      }

      switch (name) {
        case "contacts": {
          if (!isContactsArgs(args)) {
            throw new Error("Invalid arguments for contacts tool");
          }
          const contactsModule = await loadModuleForTool('contacts');
          if (args.name) {
            const numbers = await contactsModule.findNumber(args.name);
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
            const allNumbers = await contactsModule.getAllNumbers();
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
        }
        case "notes": {
          if (!isNotesArgs(args)) {
            throw new Error("Invalid arguments for notes tool");
          }
          const notesModule = await loadModuleForTool('notes');
          const { operation } = args;

          switch (operation) {
            case "search": {
              if (!args.searchText) {
                throw new Error("Search text is required for search operation");
              }
              const foundNotes = await notesModule.findNote(args.searchText);
              return {
                content: [{
                  type: "text",
                  text: foundNotes.length ?
                    foundNotes.map(note => `${note.name}:\n${note.content}`).join("\n\n") :
                    `No notes found for "${args.searchText}"`
                }],
                isError: false
              };
            }
            case "list": {
              const allNotes = await notesModule.getAllNotes();
              return {
                content: [{
                  type: "text",
                  text: allNotes.length ?
                    allNotes.map((note) => `${note.name}:\n${note.content}`)
                    .join("\n\n") :
                    "No notes exist."
                }],
                isError: false
              };
            }
            case "create": {
              if (!args.title || !args.body) {
                throw new Error("Title and body are required for create operation");
              }
              const result = await notesModule.createNote(args.title, args.body, args.folderName);
              return {
                content: [{
                  type: "text",
                  text: result.success ?
                    `Created note "${args.title}" in folder "${result.folderName}"${result.usedDefaultFolder ? ' (created new folder)' : ''}.` :
                    `Failed to create note: ${result.message}`
                }],
                isError: !result.success
              };
            }
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
        }
        case "messages": {
          if (!isMessagesArgs(args)) {
            throw new Error("Invalid arguments for messages tool");
          }
          const messageModule = await loadModuleForTool('message');
          switch (args.operation) {
            case "send": {
              if (!args.phoneNumber || !args.message) {
                throw new Error("Phone number and message are required for send operation");
              }
              await messageModule.sendMessage(args.phoneNumber, args.message);
              return {
                content: [{ type: "text", text: `Message sent to ${args.phoneNumber}` }],
                isError: false
              };
            }
            case "read": {
              if (!args.phoneNumber) {
                throw new Error("Phone number is required for read operation");
              }
              const messages = await messageModule.readMessages(args.phoneNumber, args.limit);
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
              const scheduledMsg = await messageModule.scheduleMessage(
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
              const messages = await messageModule.getUnreadMessages(args.limit);
              const contactsModule = await loadModuleForTool('contacts');
              const messagesWithNames = await Promise.all(
                messages.map(async msg => {
                  if (!msg.is_from_me) {
                    const contactName = await contactsModule.findContactByPhone(msg.sender);
                    return {
                      ...msg,
                      displayName: contactName || msg.sender
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
          const mailModule = await loadModuleForTool('mail');
          const { operation } = args;
          const { runAppleScript } = await import('run-applescript');

          switch (operation) {
            case "unread": {
              let emails;
              if (args.account) {
                console.error(`Getting unread emails for account: ${args.account}`);
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
                  emails = await mailModule.getUnreadMails(args.limit);
                }
              } else {
                // No account specified, use the general method
                emails = await mailModule.getUnreadMails(args.limit);
              }
              
              return {
                content: [{ 
                  type: "text", 
                  text: emails.length > 0 ? 
                    `Found ${emails.length} unread email(s)${args.account ? ` in account "${args.account}"` : ''}${args.mailbox ? ` and mailbox "${args.mailbox}"` : ''}:\n\n` +
                    emails.map((email: any) => 
                      `[${email.dateSent}] From: ${email.sender}\nMailbox: ${email.mailbox}\nSubject: ${email.subject}\n${email.content.substring(0, 500)}${email.content.length > 500 ? '...' : ''}`
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
              const emails = await mailModule.searchMails(args.searchTerm, args.limit);
              return {
                content: [{ 
                  type: "text", 
                  text: emails.length > 0 ? 
                    `Found ${emails.length} email(s) for "${args.searchTerm}"${args.account ? ` in account "${args.account}"` : ''}${args.mailbox ? ` and mailbox "${args.mailbox}"` : ''}:\n\n` +
                    emails.map((email: any) => 
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
              const result = await mailModule.sendMail(args.to, args.subject, args.body, args.cc, args.bcc);
              return {
                content: [{ type: "text", text: result }],
                isError: false
              };
            }
            case "mailboxes": {
              if (args.account) {
                const mailboxes = await mailModule.getMailboxesForAccount(args.account);
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
                const mailboxes = await mailModule.getMailboxes();
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
              const accounts = await mailModule.getAccounts();
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
              throw new Error(`Unknown operation: ${operation}`);
          }
        }
        case "reminders": {
          if (!isRemindersArgs(args)) {
            throw new Error("Invalid arguments for reminders tool");
          }
          const remindersModule = await loadModuleForTool('reminders');
          const { operation } = args;

          if (operation === "list") {
            // List all reminders
            const lists = await remindersModule.getAllLists();
            const allReminders = await remindersModule.getAllReminders();
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
            const results = await remindersModule.searchReminders(searchText!);
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
            const result = await remindersModule.openReminder(searchText!);
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
            const result = await remindersModule.createReminder(name!, listName, notes, dueDate);
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
            const results = await remindersModule.getRemindersFromListById(listId!, props);
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
        }
        case "webSearch": {
          if (!isWebSearchArgs(args)) {
            throw new Error("Invalid arguments for web search tool");
          }
          const webSearchModule = await loadModuleForTool('webSearch');
          const result = await webSearchModule.webSearch(args.query);
          return {
            content: [{
              type: "text",
              text: result.results.length > 0 ?
                `Found ${result.results.length} results for "${args.query}". ${result.results.map(r => `[${r.displayUrl}] ${r.title} - ${r.snippet} \n content: ${r.content}`).join("\n")}` :
                `No results found for "${args.query}".`
            }],
            isError: false
          };
        }
        case "calendar": {
          if (!isCalendarArgs(args)) {
            throw new Error("Invalid arguments for calendar tool");
          }
          const calendarModule = await loadModuleForTool('calendar');
          const { operation } = args;

          switch (operation) {
            case "search": {
              const { searchText, limit, fromDate, toDate } = args;
              const events = await calendarModule.searchEvents(searchText!, limit, fromDate, toDate);
              return {
                content: [{
                  type: "text",
                  text: events.length > 0 ?
                    `Found ${events.length} events matching "${searchText}":\n\n${events.map(event =>
                      `${event.title} (${new Date(event.startDate!).toLocaleString()} - ${new Date(event.endDate!).toLocaleString()})\n` +
                      `Location: ${event.location || 'Not specified'}\n` +
                      `Calendar: ${event.calendarName}\n` +
                      `ID: ${event.id}\n` +
                      `${event.notes ? `Notes: ${event.notes}\n` : ''}`
                    ).join("\n\n")}` :
                    `No events found matching "${searchText}".`
                }],
                isError: false
              };
            }
            case "open": {
              const { eventId } = args;
              const result = await calendarModule.openEvent(eventId!);
              return {
                content: [{
                  type: "text",
                  text: result.success ?
                    result.message :
                    `Error opening event: ${result.message}`
                }],
                isError: !result.success
              };
            }
            case "list": {
              const { limit, fromDate, toDate } = args;
              const events = await calendarModule.getEvents(limit, fromDate, toDate);
              const startDateText = fromDate ? new Date(fromDate).toLocaleDateString() : 'today';
              const endDateText = toDate ? new Date(toDate).toLocaleDateString() : 'next 7 days';
              return {
                content: [{
                  type: "text",
                  text: events.length > 0 ?
                    `Found ${events.length} events from ${startDateText} to ${endDateText}:\n\n${events.map(event =>
                      `${event.title} (${new Date(event.startDate!).toLocaleString()} - ${new Date(event.endDate!).toLocaleString()})\n` +
                      `Location: ${event.location || 'Not specified'}\n` +
                      `Calendar: ${event.calendarName}\n` +
                      `ID: ${event.id}`
                    ).join("\n\n")}` :
                    `No events found from ${startDateText} to ${endDateText}.`
                }],
                isError: false
              };
            }
            case "create": {
              const { title, startDate, endDate, location, notes, isAllDay, calendarName } = args;
              const result = await calendarModule.createEvent(title!, startDate!, endDate!, location, notes, isAllDay, calendarName);
              return {
                content: [{
                  type: "text",
                  text: result.success ?
                    `${result.message} Event scheduled from ${new Date(startDate!).toLocaleString()} to ${new Date(endDate!).toLocaleString()}${result.eventId ? `\nEvent ID: ${result.eventId}` : ''}` :
                    `Error creating event: ${result.message}`
                }],
                isError: !result.success
              };
            }
            default:
              throw new Error(`Unknown calendar operation: ${operation}`);
          }
        }
        case "maps": {
          if (!isMapsArgs(args)) {
            throw new Error("Invalid arguments for maps tool");
          }
          const mapsModule = await loadModuleForTool('maps');
          const { operation } = args;

          switch (operation) {
            case "search": {
              const { query, limit } = args;
              if (!query) {
                throw new Error("Search query is required for search operation");
              }
              const result = await mapsModule.searchLocations(query, limit);
              return {
                content: [{
                  type: "text",
                  text: result.success ?
                    `${result.message}\n\n${result.locations.map(location =>
                      `Name: ${location.name}\n` +
                      `Address: ${location.address}\n` +
                      `${location.latitude && location.longitude ? `Coordinates: ${location.latitude}, ${location.longitude}\n` : ''}`
                    ).join("\n\n")}` :
                    `${result.message}`
                }],
                isError: !result.success
              };
            }
            case "save": {
              const { name, address } = args;
              if (!name || !address) {
                throw new Error("Name and address are required for save operation");
              }
              const result = await mapsModule.saveLocation(name, address);
              return {
                content: [{
                  type: "text",
                  text: result.message
                }],
                isError: !result.success
              };
            }
            case "pin": {
              const { name, address } = args;
              if (!name || !address) {
                throw new Error("Name and address are required for pin operation");
              }
              const result = await mapsModule.dropPin(name, address);
              return {
                content: [{
                  type: "text",
                  text: result.message
                }],
                isError: !result.success
              };
            }
            case "directions": {
              const { fromAddress, toAddress, transportType } = args;
              if (!fromAddress || !toAddress) {
                throw new Error("From and to addresses are required for directions operation");
              }
              const result = await mapsModule.getDirections(fromAddress, toAddress, transportType as 'driving' | 'walking' | 'transit');
              return {
                content: [{
                  type: "text",
                  text: result.message
                }],
                isError: !result.success
              };
            }
            case "listGuides": {
              const result = await mapsModule.listGuides();
              return {
                content: [{
                  type: "text",
                  text: result.message
                }],
                isError: !result.success
              };
            }
            case "addToGuide": {
              const { address, guideName } = args;
              if (!address || !guideName) {
                throw new Error("Address and guideName are required for addToGuide operation");
              }
              const result = await mapsModule.addToGuide(address, guideName);
              return {
                content: [{
                  type: "text",
                  text: result.message
                }],
                isError: !result.success
              };
            }
            case "createGuide": {
              const { guideName } = args;
              if (!guideName) {
                throw new Error("Guide name is required for createGuide operation");
              }
              const result = await mapsModule.createGuide(guideName);
              return {
                content: [{
                  type: "text",
                  text: result.message
                }],
                isError: !result.success
              };
            }
            default:
              throw new Error(`Unknown maps operation: ${operation}`);
          }
        }
        default:
          console.error(`Unknown tool called: ${name}`);
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
        console.error(`Error during callTool execution for tool: ${request.params.name}`, error);
        return {
            content: [
            {
                type: "text",
                text: `Error calling tool ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`,
            },
            ],
            isError: true,
        };
    }
  });

  // Start the server transport
  console.error("Setting up MCP server transport...");
  try {
    const transport = new StdioServerTransport();

    // Filter stdout (optional, but useful for debugging)
    console.error("Setting up stdout filter...");
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
      // Allow JSON messages and potentially Buffer data if needed
      let allow = false;
      if (typeof chunk === "string") {
        allow = chunk.startsWith("{");
      } else if (Buffer.isBuffer(chunk)) {
        // Check if buffer *might* be JSON (naive check)
        const str = chunk.toString('utf8').trim();
        allow = str.startsWith("{") && str.endsWith("}");
      }

      if (allow) {
        return originalStdoutWrite(chunk, encoding, callback);
      } else {
         // Log filtered messages to stderr instead of discarding silently
         console.error("[Filtered STDOUT]:", typeof chunk === 'string' ? chunk : chunk.toString('hex'));
         if (callback) callback();
         return true;
      }
    };

    console.error("Connecting transport to server...");
    await server.connect(transport);
    console.error("MCP server connected and ready!");
  } catch (error) {
    console.error("Failed to initialize or connect MCP server transport:", error);
    process.exit(1); // Exit if transport fails
  }
}

// --- Type Guard Functions (Keep these as they are) ---
function isContactsArgs(args: unknown): args is { name?: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    (!("name" in args) || typeof (args as { name: string }).name === "string")
  );
}

function isNotesArgs(args: unknown): args is {
  operation: "search" | "list" | "create";
  searchText?: string;
  title?: string;
  body?: string;
  folderName?: string;
} {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const { operation } = args as { operation?: unknown };
  if (typeof operation !== "string") {
    return false;
  }

  if (!["search", "list", "create"].includes(operation)) {
    return false;
  }

  // Validate fields based on operation
  if (operation === "search") {
    const { searchText } = args as { searchText?: unknown };
    if (typeof searchText !== "string" || searchText === "") {
      return false;
    }
  }

  if (operation === "create") {
    const { title, body } = args as { title?: unknown, body?: unknown };
    if (typeof title !== "string" || title === "" ||
        typeof body !== "string") {
      return false;
    }

    // Check folderName if provided
    const { folderName } = args as { folderName?: unknown };
    if (folderName !== undefined && (typeof folderName !== "string" || folderName === "")) {
      return false;
    }
  }

  return true;
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

function isWebSearchArgs(args: unknown): args is { query: string } {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof (args as { query: string }).query === "string"
  );
}

function isCalendarArgs(args: unknown): args is {
  operation: "search" | "open" | "list" | "create";
  searchText?: string;
  eventId?: string;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  notes?: string;
  isAllDay?: boolean;
  calendarName?: string;
} {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const { operation } = args as { operation?: unknown };
  if (typeof operation !== "string") {
    return false;
  }

  if (!["search", "open", "list", "create"].includes(operation)) {
    return false;
  }

  // Check that required parameters are present for each operation
  if (operation === "search") {
    const { searchText } = args as { searchText?: unknown };
    if (typeof searchText !== "string") {
      return false;
    }
  }

  if (operation === "open") {
    const { eventId } = args as { eventId?: unknown };
    if (typeof eventId !== "string") {
      return false;
    }
  }

  if (operation === "create") {
    const { title, startDate, endDate } = args as {
      title?: unknown;
      startDate?: unknown;
      endDate?: unknown;
    };

    if (typeof title !== "string" || typeof startDate !== "string" || typeof endDate !== "string") {
      return false;
    }
  }

  return true;
}

function isMapsArgs(args: unknown): args is {
  operation: "search" | "save" | "directions" | "pin" | "listGuides" | "addToGuide" | "createGuide";
  query?: string;
  limit?: number;
  name?: string;
  address?: string;
  fromAddress?: string;
  toAddress?: string;
  transportType?: string;
  guideName?: string;
} {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const { operation } = args as { operation?: unknown };
  if (typeof operation !== "string") {
    return false;
  }

  if (!["search", "save", "directions", "pin", "listGuides", "addToGuide", "createGuide"].includes(operation)) {
    return false;
  }

  // Check that required parameters are present for each operation
  if (operation === "search") {
    const { query } = args as { query?: unknown };
    if (typeof query !== "string" || query === "") {
      return false;
    }
  }

  if (operation === "save" || operation === "pin") {
    const { name, address } = args as { name?: unknown; address?: unknown };
    if (typeof name !== "string" || name === "" || typeof address !== "string" || address === "") {
      return false;
    }
  }

  if (operation === "directions") {
    const { fromAddress, toAddress } = args as { fromAddress?: unknown; toAddress?: unknown };
    if (typeof fromAddress !== "string" || fromAddress === "" || typeof toAddress !== "string" || toAddress === "") {
      return false;
    }

    // Check transportType if provided
    const { transportType } = args as { transportType?: unknown };
    if (transportType !== undefined &&
        (typeof transportType !== "string" || !["driving", "walking", "transit"].includes(transportType))) {
      return false;
    }
  }

  if (operation === "createGuide") {
    const { guideName } = args as { guideName?: unknown };
    if (typeof guideName !== "string" || guideName === "") {
      return false;
    }
  }

  if (operation === "addToGuide") {
    const { address, guideName } = args as { address?: unknown; guideName?: unknown };
    if (typeof address !== "string" || address === "" || typeof guideName !== "string" || guideName === "") {
      return false;
    }
  }

  return true;
}
// --- End Type Guard Functions ---

// --- Server Execution ---
initServer().catch((error) => {
  console.error("Failed to initialize MCP server:", error);
  process.exit(1);
});
// --- End Server Execution ---
