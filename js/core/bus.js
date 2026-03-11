// Event Bus simplificado

export function createBus() {
    const listeners = new Map();

    return {
        emit(event, data = null) {
            const eventListeners = listeners.get(event) || [];
            eventListeners.forEach(callback => {
                try {
                    callback({ detail: data });
                } catch (error) {
                    console.error(`Error en listener para ${event}:`, error);
                }
            });
        },

        on(event, callback) {
            if (!listeners.has(event)) {
                listeners.set(event, []);
            }
            listeners.get(event).push(callback);

            // Retornar función para desuscribirse
            return () => {
                const eventListeners = listeners.get(event);
                if (eventListeners) {
                    const index = eventListeners.indexOf(callback);
                    if (index > -1) {
                        eventListeners.splice(index, 1);
                    }
                }
            };
        },

        off(event, callback) {
            const eventListeners = listeners.get(event);
            if (eventListeners) {
                const index = eventListeners.indexOf(callback);
                if (index > -1) {
                    eventListeners.splice(index, 1);
                }
            }
        },

        once(event, callback) {
            const wrappedCallback = (eventData) => {
                callback(eventData);
                this.off(event, wrappedCallback);
            };
            this.on(event, wrappedCallback);
        }
    };
}
