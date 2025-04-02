import { run } from '@jxa/run';

type Note = {
    name: string;
    content: string;
};

type CreateNoteResult = {
    success: boolean;
    note?: Note;
    message?: string;
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

async function createNote(title: string, body: string, folderName?: string): Promise<CreateNoteResult> {
    try {
        const result = await run((title: string, body: string, folderName?: string) => {
            const Notes = Application('Notes');
            
            // Create the note
            let targetFolder;
            
            if (folderName) {
                // Try to find the specified folder
                const folders = Notes.folders();
                targetFolder = folders.find((folder: any) => 
                    folder.name() === folderName
                );
                
                if (!targetFolder) {
                    throw new Error(`Folder "${folderName}" not found`);
                }
            }
            
            // Create the note in the specified folder or default folder
            const newNote = Notes.Body.make();
            newNote.name = title;
            newNote.body = body;
            
            if (targetFolder) {
                Notes.Body.make({at: targetFolder, withProperties: {name: title, body: body}});
            } else {
                Notes.make({withProperties: {name: title, body: body}});
            }
            
            return {
                success: true,
                note: {
                    name: title,
                    content: body
                }
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

