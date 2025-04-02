#!/usr/bin/env bun
import { run } from '@jxa/run';
import notesModule from './utils/notes';

async function testNotes() {
  console.log("Testing Notes Module");
  
  try {
    // Test 1: Create a note in the default 'Claude' folder
    console.log("\n1. Creating note in default 'Claude' folder...");
    const result1 = await notesModule.createNote(
      "Test Default Folder", 
      "This note should be created in the Claude folder"
    );
    console.log(result1);
    
    // Test 2: Create a note in a specific folder
    console.log("\n2. Creating note in a specific folder (may fail if folder doesn't exist)...");
    const result2 = await notesModule.createNote(
      "Test Specific Folder", 
      "This note should be created in a specific folder",
      "Work"
    );
    console.log(result2);
    
    // Test 3: Create a note with non-existent folder (should fail)
    console.log("\n3. Creating note with non-existent folder...");
    const result3 = await notesModule.createNote(
      "Test Non-existent Folder", 
      "This note should fail to create",
      "TheFolderDoesNotExist"
    );
    console.log(result3);
    
    // Test 4: Find a note
    console.log("\n4. Finding created notes...");
    const foundNotes = await notesModule.findNote("Test Default Folder");
    console.log(`Found ${foundNotes.length} notes matching 'Test Default Folder'`);
    console.log(foundNotes);
    
    // Test 5: List all notes
    console.log("\n5. Listing all notes...");
    const allNotes = await notesModule.getAllNotes();
    console.log(`Found ${allNotes.length} notes in total`);
    // Don't print all notes, could be too verbose
    console.log(`First note: ${allNotes.length > 0 ? allNotes[0].name : 'None'}`);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run tests
testNotes();