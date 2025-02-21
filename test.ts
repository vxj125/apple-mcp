import message from './utils/message';

async function test() {
    try {
        console.log("Starting test...");
        
        // Test getting unread messages
        console.log("\nChecking for unread messages...");
        const unreadMessages = await message.getUnreadMessages(5);
        console.log("Unread messages check complete");
        
        if (unreadMessages.length === 0) {
            console.log("No unread messages found");
        } else {
            console.log(`Found ${unreadMessages.length} unread messages:`);
            unreadMessages.forEach((msg, i) => {
                console.log(`\n[${i + 1}] ${new Date(msg.date).toLocaleString()}`);
                console.log(`From: ${msg.sender}`);
                console.log(`Message: ${msg.content}`);
            });
        }

        // Test with a known phone number
        const testNumber = "+1234567890";  // Example phone number
        console.log(`\nTesting with phone number: ${testNumber}`);

        // Test reading messages
        console.log("\nAttempting to read last 5 messages...");
        const messages = await message.readMessages(testNumber, 5);
        console.log("Read messages complete");
        
        if (messages.length === 0) {
            console.log("No messages found");
        } else {
            messages.forEach((msg, i) => {
                console.log(`\n[${i + 1}] ${new Date(msg.date).toLocaleString()}`);
                console.log(`From: ${msg.is_from_me ? 'Me' : msg.sender}`);
                console.log(`Message: ${msg.content}`);
            });
        }

        console.log("\nTest completed successfully!");

    } catch (error) {
        console.error("Test failed with error:", error);
        // Print full error stack trace
        if (error instanceof Error && error.stack) {
            console.error("Stack trace:", error.stack);
        }
    }
}

console.log("Starting test script...");
test().catch(error => {
    console.error("Unhandled error in test:", error);
    process.exit(1);
}); 