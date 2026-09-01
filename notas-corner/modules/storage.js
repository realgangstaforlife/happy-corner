/**
 * Storage Service - Manages local cache for offline capabilities
 */
export const StorageService = {
    CACHE_KEY: 'notas_corner_cache',
    
    /**
     * Guarda las notas en el localStorage
     */
    saveNotes(notes) {
        try {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(notes));
        } catch (error) {
            console.error("Error saving notes to cache:", error);
        }
    },
    
    /**
     * Obtiene las notas del localStorage
     */
    getNotes() {
        try {
            const cached = localStorage.getItem(this.CACHE_KEY);
            return cached ? JSON.parse(cached) : [];
        } catch (error) {
            console.error("Error parsing cached notes:", error);
            return [];
        }
    },
    
    /**
     * Limpia la caché local
     */
    clearCache() {
        localStorage.removeItem(this.CACHE_KEY);
    },
    
    /**
     * Exporta las notas a un archivo JSON (.happyc)
     */
    exportNotes(notes) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(notes, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `mis_notas_${new Date().toISOString().split('T')[0]}.happyc`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },
    
    /**
     * Lee un archivo .happyc (JSON)
     */
    async readNotesFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const notes = JSON.parse(event.target.result);
                    resolve(notes);
                } catch (error) {
                    reject(new Error("Archivo inválido o corrupto"));
                }
            };
            reader.onerror = () => reject(new Error("Error leyendo el archivo"));
            reader.readAsText(file);
        });
    }
};
