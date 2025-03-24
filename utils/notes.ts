import { run } from '@jxa/run';

type Note = {
    name: string;
    content: string;
};
  

async function getAllNotes() {
    const notes: Note[] = await run(() => {
        const Notes = Application('Notes');
        const notes = Notes.notes();

        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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

export default { getAllNotes, findNote };

