import { run } from '@jxa/run';

type Note = {
    name: string;
    content: string;
};

type CreateNoteResult = {
    success: boolean;
    note?: Note;
    message?: string;
    folderName?: string;
    usedDefaultFolder?: boolean;
};
  
async function getAllNotes() {
    const notes: Note[] = await run(() => {
        const Notes = Application('Notes');
        const notes = Notes.notes();

        return notes.map((note: any) => ({
            name: note.name(),
            content: note.plaintext()
        }));
    });

    return notes;
}

async function findNote(searchText: string) {
    const notes: Note[] = await run((searchText: string) => {
        const Notes = Application('Notes');
        const notes = Notes.notes.whose({_or: [
            {name: {_contains: searchText}},
            {plaintext: {_contains: searchText}}
        ]})()
        return notes.length > 0 ? notes.map((note: any) => ({
            name: note.name(),
            content: note.plaintext()
        })) : [];
    }, searchText);

    if (notes.length === 0) {
        const allNotes = await getAllNotes();
        const closestMatch = allNotes.find(({name}) => 
            name.toLowerCase().includes(searchText.toLowerCase())
        );
        return closestMatch ? [{
            name: closestMatch.name,
            content: closestMatch.content
        }] : [];
    }

    return notes;
}

async function createNote(title: string, body: string, folderName: string = 'Claude'): Promise<CreateNoteResult> {
    try {
        const result = await run((title: string, body: string, folderName: string) => {
            const Notes = Application('Notes');
            
            // Create the note
            let targetFolder;
            let usedDefaultFolder = false;
            
            // Try to find the specified folder
            const folders = Notes.folders();
            targetFolder = folders.find((folder: any) => 
                folder.name() === folderName
            );
            
            // If the specified folder doesn't exist
            if (!targetFolder) {
                if (folderName === 'Claude') {
                    // Try to create the Claude folder if it doesn't exist
                    try {
                        targetFolder = Notes.Folder.make({withProperties: {name: 'Claude'}});
                        usedDefaultFolder = true;
                    } catch (error) {
                        // If we can't create the Claude folder, use the default folder
                        targetFolder = null;
                    }
                } else {
                    throw new Error(`Folder "${folderName}" not found`);
                }
            }
            
            // Create the note in the specified folder or default folder
            let newNote;
            if (targetFolder) {
                newNote = Notes.Body.make({at: targetFolder, withProperties: {name: title, body: body}});
            } else {
                newNote = Notes.make({withProperties: {name: title, body: body}});
            }
            
            return {
                success: true,
                note: {
                    name: title,
                    content: body
                },
                folderName: targetFolder ? folderName : 'Default',
                usedDefaultFolder: usedDefaultFolder
            };
        }, title, body, folderName);
        
        return result;
    } catch (error) {
        return {
            success: false,
            message: `Failed to create note: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

export default { getAllNotes, findNote, createNote };

