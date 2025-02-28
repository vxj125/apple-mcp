# Apple MCP tools

This is a collection of apple-native tools for the [MCP protocol](https://modelcontextprotocol.com/docs/mcp-protocol).

Here's a step-by-step video about how to set this up, with a demo. - https://x.com/DhravyaShah/status/1892694077679763671

![Setup](https://i.dhr.wtf/r/Clipboard_Feb_26,_2025_at_11.20 PM.png)

<details>
<summary>Here's the JSON to copy</summary>

```
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["--no-cache", "@dhravya/apple-mcp@latest"]
    }
  }
}
```

</details>


## Features

- Messages:
  - Send messages using the Apple Messages app
  - Read out messages
- Notes:
  - List notes
  - Search & read notes in Apple Notes app
- Contacts:
  - Search contacts for sending messages
- Emails:
  - Send emails with multiple recipients (to, cc, bcc) and file attachments
  - Search emails with custom queries, mailbox selection, and result limits
  - Schedule emails for future delivery
  - List and manage scheduled emails
  - Check unread email counts globally or per mailbox
- Reminders:
  - List all reminders and reminder lists
  - Search for reminders by text
  - Create new reminders with optional due dates and notes
  - Open the Reminders app to view specific reminders

- TODO: Search and open calendar events in Apple Calendar app
- TODO: Search and open photos in Apple Photos app
- TODO: Search and open music in Apple Music app


You can also daisy-chain commands to create a workflow. Like:
"can you please read the note about people i met in the conference, find their contacts and emails, and send them a message saying thank you for the time."

(it works!)

### Installation

You just need bun, install with `brew install oven-sh/bun/bun`

Now, edit your `claude_desktop_config.json` with this:

```claude_desktop_config.json
{
  "mcpServers": {
    "apple-mcp": {
      "command": "bunx",
      "args": ["@dhravya/apple-mcp@latest"]
    }
  }
}
```

Now, ask Claude to use the `apple-mcp` tool.

```
Can you send a message to John Doe?
```

```
find all the notes related to AI and send it to my girlfriend
```

```
create a reminder to "Buy groceries" for tomorrow at 5pm
```

## Local Development

```bash
git clone https://github.com/dhravya/apple-mcp.git
cd apple-mcp
bun install
bun run index.ts
```

enjoy!
