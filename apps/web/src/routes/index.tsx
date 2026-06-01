import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ShellBar, Text } from '@ui5/webcomponents-react';
import { orpc } from '../orpc';

export const Route = createFileRoute('/')({
  component: function Home() {
    const ping = useQuery(orpc.system.ping.queryOptions({ input: { msg: 'hello' } }));
    return (
      <>
        <ShellBar primaryTitle="CPQ" />
        <Text>{ping.data ? `pong: ${ping.data.pong} @ ${ping.data.at}` : 'loading…'}</Text>
      </>
    );
  },
});
