import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useLayoutEffect } from 'react';

import * as List from '../../containers/List';
import SafeAreaView from '../../containers/SafeAreaView';
import StatusBar from '../../containers/StatusBar';
import Switch from '../../containers/Switch';
import I18n from '../../i18n';
import { useHasE2EEWarning } from '../../lib/encryption/helpers/hooks';
import { toggleRoomE2EE } from '../../lib/encryption/helpers/toggleRoomE2EE';
import { getRoomTitle } from '../../lib/methods/helpers';
import { ChatsStackParamList } from '../../stacks/types';
import { useTheme } from '../../theme';
import { resetRoomKey } from './resetRoomKey';
import { useRoom } from './useRoom';

const getRoomTypeI18n = (t?: string, teamMain?: boolean) => {
	if (teamMain) {
		return 'team';
	}
	if (t === 'd') {
		return 'direct_message';
	}
	return 'channel';
};

const E2EEToggleRoomView = ({ navigation }: { navigation: any }) => {
	const route = useRoute<RouteProp<ChatsStackParamList, 'E2EEToggleRoomView'>>();
	const { rid } = route.params;
	const { colors } = useTheme();
	const room = useRoom(rid);
	const hasE2EEWarning = useHasE2EEWarning(room?.encrypted, room?.E2EKey);

	useLayoutEffect(() => {
		navigation?.setOptions({
			title: I18n.t('E2E_Encryption')
		});
	}, []);

	if (!room) {
		return null;
	}

	const roomType = getRoomTypeI18n(room?.t, room?.teamMain);
	const roomName = getRoomTitle(room);

	return (
		<SafeAreaView>
			<StatusBar />
			<List.Container>
				<List.Section>
					<List.Separator />
					<List.Item
						title={I18n.t('Encrypt__room_type__', { room_type: roomType })}
						right={() => <Switch value={room?.encrypted} onValueChange={() => toggleRoomE2EE(rid)} />}
						translateTitle={false}
					/>
					<List.Separator />
					<List.Info info={I18n.t('Encrypt__room_type__info__room_name__', { room_name: roomName })} translateInfo={false} />
				</List.Section>

				{hasE2EEWarning ? (
					<List.Section>
						<List.Separator />
						<List.Item title='Reset_encryption_keys' color={colors.fontDanger} onPress={() => resetRoomKey(rid)} />
						<List.Separator />
						<List.Info info={I18n.t('Reset_encryption_keys_info__room_type__', { room_type: roomType })} translateInfo={false} />
					</List.Section>
				) : null}
			</List.Container>
		</SafeAreaView>
	);
};
export default E2EEToggleRoomView;
