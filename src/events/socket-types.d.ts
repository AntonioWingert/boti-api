declare module 'socket.io' {
  export interface Socket {
    id: string;
    handshake: {
      auth?: {
        token?: string;
      };
      headers?: {
        authorization?: string;
      };
    };
    emit(event: string, data: any): void;
    join(room: string): void;
    leave(room: string): void;
    disconnect(): void;
  }

  export class Server {
    to(room: string): {
      emit(event: string, data: any): void;
    };
    emit(event: string, data: any): void;
  }
}
