import CityCanvas from '../components/CityCanvas';

const SAMPLE_PAYLOAD = {
    classes: [
        { Classname: 'UserService', Type: 'class', Methods: [{ name: 'login' }, { name: 'logout' }, { name: 'register' }], Fields: [{ name: 'db' }] },
        { Classname: 'IAuthProvider', Type: 'interface', Methods: [{ name: 'authenticate' }, { name: 'revoke' }], Fields: [] },
        { Classname: 'TokenStore', Type: 'class', Methods: [{ name: 'get' }, { name: 'set' }], Fields: [{ name: 'cache' }] },
    ],
    layout: {
        UserService: { col: 3, row: 3, depth: 0 },
        IAuthProvider: { col: 7, row: 2, depth: 0 },
        TokenStore: { col: 5, row: 6, depth: 0 },
    }
};

export default function DashboardPage() {
    return (
        <div className="w-full h-screen bg-zinc-900">
            <CityCanvas
                payload={SAMPLE_PAYLOAD}
                onBuildingClick={(b) => console.log('clicked:', b.className)}
                className="w-full h-full"
            />
        </div>
    );
}