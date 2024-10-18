import { useState } from 'react';
import { Keyboard } from 'react-native';
import { useDispatch } from 'react-redux';
import { Base64 } from 'js-base64';
import parse from 'url-parse';

import { events, logEvent } from '../../../lib/methods/helpers/log';
import UserPreferences from '../../../lib/methods/userPreferences';
import { serverRequest } from '../../../actions/server';
import { BASIC_AUTH_KEY, setBasicAuth } from '../../../lib/methods/helpers/fetch';
import { CERTIFICATE_KEY } from '../../../lib/constants';
import completeUrl from '../utils/completeUrl';
import { ISubmitParams } from '../definitions';

type TUseNewServerProps = {
	text: string;
	certificate: string | null;
};

const useConnectServer = ({ text, certificate }: TUseNewServerProps) => {
	const dispatch = useDispatch();
	const [connectingOpen, setConnectingOpen] = useState(false);

	const basicAuth = (server: string, text: string) => {
		try {
			const parsedUrl = parse(text, true);
			if (parsedUrl.auth.length) {
				const credentials = Base64.encode(parsedUrl.auth);
				UserPreferences.setString(`${BASIC_AUTH_KEY}-${server}`, credentials);
				setBasicAuth(credentials);
			}
		} catch {
			// do nothing
		}
	};

	const connectOpen = () => {
		logEvent(events.NS_JOIN_OPEN_WORKSPACE);
		setConnectingOpen(true);
		dispatch(serverRequest('https://open.rocket.chat'));
	};

	const submit = ({ fromServerHistory = false, username, serverUrl }: ISubmitParams = {}) => {
		logEvent(events.NS_CONNECT_TO_WORKSPACE);

		setConnectingOpen(false);
		if (text || serverUrl) {
			Keyboard.dismiss();
			const server = completeUrl(serverUrl ?? text);

			// Save info - SSL Pinning
			if (certificate) {
				UserPreferences.setString(`${CERTIFICATE_KEY}-${server}`, certificate);
			}

			// Save info - HTTP Basic Authentication
			basicAuth(server, serverUrl ?? text);

			if (fromServerHistory) {
				dispatch(serverRequest(server, username, true));
			} else {
				dispatch(serverRequest(server));
			}
		}
	};

	return {
		connectingOpen,
		connectOpen,
		submit
	};
};

export default useConnectServer;
