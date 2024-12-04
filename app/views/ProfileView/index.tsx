import { NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { sha256 } from 'js-sha256';
import React, { useLayoutEffect, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { useDispatch } from 'react-redux';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import { setUser } from '../../actions/login';
import { useActionSheet } from '../../containers/ActionSheet';
import ActionSheetContentWithInputAndSubmit from '../../containers/ActionSheet/ActionSheetContentWithInputAndSubmit';
import { AvatarWithEdit } from '../../containers/Avatar';
import Button from '../../containers/Button';
import * as HeaderButton from '../../containers/HeaderButton';
import KeyboardView from '../../containers/KeyboardView';
import SafeAreaView from '../../containers/SafeAreaView';
import StatusBar from '../../containers/StatusBar';
import { ControlledFormTextInput } from '../../containers/TextInput';
import { LISTENER } from '../../containers/Toast';
import { IProfileParams } from '../../definitions';
import { TwoFactorMethods } from '../../definitions/ITotp';
import I18n from '../../i18n';
import { compareServerVersion, showConfirmationAlert, showErrorAlert } from '../../lib/methods/helpers';
import EventEmitter from '../../lib/methods/helpers/events';
import { events, logEvent } from '../../lib/methods/helpers/log';
import scrollPersistTaps from '../../lib/methods/helpers/scrollPersistTaps';
import { Services } from '../../lib/services';
import { twoFactor } from '../../lib/services/twoFactor';
import { getUserSelector } from '../../selectors/login';
import { ProfileStackParamList } from '../../stacks/types';
import { useTheme } from '../../theme';
import sharedStyles from '../Styles';
import { DeleteAccountActionSheetContent } from './components/DeleteAccountActionSheetContent';
import styles from './styles';
import { useAppSelector } from '../../lib/hooks';
import getParsedCustomFields from './methods/getParsedCustomFields';
import getCustomFields from './methods/getCustomFields';
import CustomFields from './components/CustomFields';

// https://github.com/RocketChat/Rocket.Chat/blob/174c28d40b3d5a52023ee2dca2e81dd77ff33fa5/apps/meteor/app/lib/server/functions/saveUser.js#L24-L25
const MAX_BIO_LENGTH = 260;
const MAX_NICKNAME_LENGTH = 120;
const passwordRules = /^(?!.*(.)\1{2})^(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,24}$/;
const validationSchema = yup.object().shape({
	name: yup.string().min(1).required(),
	email: yup.string().email().required(),
	username: yup.string().min(1).required(),
	newPassword: yup.string().nullable().notRequired().matches(passwordRules)
});

interface IProfileViewProps {
	navigation: NativeStackNavigationProp<ProfileStackParamList, 'ProfileView'>;
}
const ProfileView = ({ navigation }: IProfileViewProps): React.ReactElement => {
	const { showActionSheet, hideActionSheet } = useActionSheet();
	const { colors } = useTheme();
	const dispatch = useDispatch();
	const {
		Accounts_AllowDeleteOwnAccount,
		Accounts_AllowEmailChange,
		Accounts_AllowPasswordChange,
		Accounts_AllowRealNameChange,
		Accounts_AllowUserAvatarChange,
		Accounts_AllowUsernameChange,
		Accounts_CustomFields,
		isMasterDetail,
		serverVersion,
		user
	} = useAppSelector(state => ({
		user: getUserSelector(state),
		isMasterDetail: state.app.isMasterDetail,
		Accounts_AllowEmailChange: state.settings.Accounts_AllowEmailChange as boolean,
		Accounts_AllowPasswordChange: state.settings.Accounts_AllowPasswordChange as boolean,
		Accounts_AllowRealNameChange: state.settings.Accounts_AllowRealNameChange as boolean,
		Accounts_AllowUserAvatarChange: state.settings.Accounts_AllowUserAvatarChange as boolean,
		Accounts_AllowUsernameChange: state.settings.Accounts_AllowUsernameChange as boolean,
		Accounts_CustomFields: state.settings.Accounts_CustomFields as string,
		serverVersion: state.server.version,
		Accounts_AllowDeleteOwnAccount: state.settings.Accounts_AllowDeleteOwnAccount as boolean
	}));
	const {
		control,
		handleSubmit,
		setFocus,
		getValues,
		setValue,
		formState: { isDirty }
	} = useForm({
		mode: 'onChange',
		defaultValues: {
			name: user?.name as string,
			username: user?.username,
			email: user?.emails ? user?.emails[0].address : null,
			newPassword: null,
			currentPassword: null,
			bio: user?.bio,
			nickname: user?.nickname,
			saving: false
		},
		resolver: yupResolver(validationSchema)
	});
	const parsedCustomFields = getParsedCustomFields(Accounts_CustomFields);
	const [customFields, setCustomFields] = useState(getCustomFields(parsedCustomFields));
	const [twoFactorCode, setTwoFactorCode] = useState<{ twoFactorCode: string; twoFactorMethod: TwoFactorMethods } | null>(null);

	const validateFormInfo = () => {
		const isValid = validationSchema.isValidSync(getValues());
		let requiredCheck = true;
		Object.keys(parsedCustomFields).forEach((key: string) => {
			if (parsedCustomFields[key].required) {
				requiredCheck = requiredCheck && customFields[key] && Boolean(customFields[key].trim());
			}
		});
		return isValid && requiredCheck;
	};

	const enableSaveChangesButton = () => {
		const isFormInfoValid = validateFormInfo();
		return isFormInfoValid && isDirty;
	};

	const handleError = (e: any, action: string) => {
		if (e.data && e.data.error.includes('[error-too-many-requests]')) {
			return showErrorAlert(e.data.error);
		}
		if (I18n.isTranslated(e.error)) {
			return showErrorAlert(I18n.t(e.error));
		}
		let msg = I18n.t('There_was_an_error_while_action', { action: I18n.t(action) });
		let title = '';
		if (typeof e.reason === 'string') {
			title = msg;
			msg = e.reason;
		}
		showErrorAlert(msg, title);
	};

	const handleEditAvatar = () => {
		navigation.navigate('ChangeAvatarView', { context: 'profile' });
	};

	const logoutOtherLocations = () => {
		logEvent(events.PL_OTHER_LOCATIONS);
		showConfirmationAlert({
			message: I18n.t('You_will_be_logged_out_from_other_locations'),
			confirmationText: I18n.t('Logout'),
			onPress: async () => {
				try {
					await Services.logoutOtherLocations();
					EventEmitter.emit(LISTENER, { message: I18n.t('Logged_out_of_other_clients_successfully') });
				} catch {
					logEvent(events.PL_OTHER_LOCATIONS_F);
					EventEmitter.emit(LISTENER, { message: I18n.t('Logout_failed') });
				}
			}
		});
	};

	const deleteOwnAccount = () => {
		logEvent(events.DELETE_OWN_ACCOUNT);
		showActionSheet({ children: <DeleteAccountActionSheetContent /> });
	};

	const submit = async (): Promise<void> => {
		Keyboard.dismiss();

		if (!validateFormInfo()) {
			return;
		}

		setValue('saving', true);

		const { name, username, email, newPassword, currentPassword, bio, nickname } = getValues();
		const params = {} as IProfileParams;

		if (user.name !== name) params.realname = name;
		if (user.username !== username) params.username = username;
		if (user.emails?.[0].address !== email) params.email = email;
		if (user.bio !== bio) params.bio = bio;
		if (user.nickname !== nickname) params.nickname = nickname;
		if (newPassword) params.newPassword = newPassword;
		if (currentPassword) params.currentPassword = sha256(currentPassword);

		const requirePassword = !!params.email || newPassword;

		if (requirePassword && !params.currentPassword) {
			setValue('saving', false);
			showActionSheet({
				children: (
					<ActionSheetContentWithInputAndSubmit
						title={I18n.t('Please_enter_your_password')}
						description={I18n.t('For_your_security_you_must_enter_your_current_password_to_continue')}
						testID='profile-view-enter-password-sheet'
						placeholder={I18n.t('Password')}
						onSubmit={p => {
							hideActionSheet();
							setValue('currentPassword', p as any);
							submit();
						}}
						onCancel={hideActionSheet}
					/>
				)
			});
			return;
		}

		try {
			const twoFactorOptions = params.currentPassword
				? { twoFactorCode: params.currentPassword, twoFactorMethod: TwoFactorMethods.PASSWORD }
				: null;

			const result = await Services.saveUserProfileMethod(params, customFields, twoFactorCode || twoFactorOptions);

			if (result) {
				logEvent(events.PROFILE_SAVE_CHANGES);
				if ('realname' in params) {
					params.name = params.realname;
					delete params.realname;
				}
				if (customFields) {
					dispatch(setUser({ customFields, ...params }));
					setCustomFields(customFields);
				} else {
					dispatch(setUser({ ...params }));
					const user = { ...getValues(), ...params };
					Object.entries(user).forEach(([key, value]) => setValue(key as any, value));
				}
				dispatch(setUser({ ...user, ...params, customFields }));
				EventEmitter.emit(LISTENER, { message: I18n.t('Profile_saved_successfully') });
			}

			setValue('saving', false);
			setValue('currentPassword', null);
			setTwoFactorCode(null);
		} catch (e: any) {
			if (e?.error === 'totp-invalid' && e?.details.method !== TwoFactorMethods.PASSWORD) {
				try {
					const code = await twoFactor({ method: e.details.method, invalid: e?.error === 'totp-invalid' && !!twoFactorCode });
					setTwoFactorCode(code as any);
					return submit();
				} catch {
					// Two-factor modal canceled
				}
			}
			logEvent(events.PROFILE_SAVE_CHANGES_F);
			setValue('saving', false);
			setValue('currentPassword', null);
			setTwoFactorCode(null);
			handleError(e, 'saving_profile');
		}
	};

	useLayoutEffect(() => {
		const options: NativeStackNavigationOptions = {
			title: I18n.t('Profile')
		};
		if (!isMasterDetail) {
			options.headerLeft = () => <HeaderButton.Drawer navigation={navigation} />;
		}
		options.headerRight = () => (
			<HeaderButton.Preferences onPress={() => navigation?.navigate('UserPreferencesView')} testID='preferences-view-open' />
		);

		navigation.setOptions(options);
	}, []);

	return (
		<KeyboardView contentContainerStyle={sharedStyles.container} keyboardVerticalOffset={128}>
			<StatusBar />
			<SafeAreaView testID='profile-view'>
				<ScrollView
					contentContainerStyle={[sharedStyles.containerScrollView, { backgroundColor: colors.surfaceTint, paddingTop: 32 }]}
					testID='profile-view-list'
					{...scrollPersistTaps}>
					<View style={styles.avatarContainer} testID='profile-view-avatar'>
						<AvatarWithEdit text={user.username} handleEdit={Accounts_AllowUserAvatarChange ? handleEditAvatar : undefined} />
					</View>

					<ControlledFormTextInput
						required
						name='name'
						control={control}
						editable={Accounts_AllowRealNameChange}
						inputStyle={[!Accounts_AllowRealNameChange && styles.disabled]}
						label={I18n.t('Name')}
						placeholder={I18n.t('Name')}
						onSubmitEditing={() => {
							setFocus('username');
						}}
						testID='profile-view-name'
					/>
					<ControlledFormTextInput
						required
						name='username'
						control={control}
						editable={Accounts_AllowUsernameChange}
						inputStyle={[!Accounts_AllowUsernameChange && styles.disabled]}
						label={I18n.t('Username')}
						placeholder={I18n.t('Username')}
						onSubmitEditing={() => {
							setFocus('email');
						}}
						testID='profile-view-username'
					/>
					<ControlledFormTextInput
						required
						name='email'
						control={control}
						editable={Accounts_AllowEmailChange}
						inputStyle={[!Accounts_AllowEmailChange && styles.disabled]}
						label={I18n.t('Email')}
						placeholder={I18n.t('Email')}
						onSubmitEditing={() => {
							setFocus('nickname');
						}}
						testID='profile-view-email'
					/>
					{compareServerVersion(serverVersion, 'greaterThanOrEqualTo', '3.5.0') ? (
						<ControlledFormTextInput
							name='nickname'
							control={control}
							label={I18n.t('Nickname')}
							onSubmitEditing={() => {
								setFocus('bio');
							}}
							testID='profile-view-nickname'
							maxLength={MAX_NICKNAME_LENGTH}
						/>
					) : null}
					{compareServerVersion(serverVersion, 'greaterThanOrEqualTo', '3.1.0') ? (
						<ControlledFormTextInput
							name='bio'
							control={control}
							label={I18n.t('Bio')}
							inputStyle={styles.inputBio}
							multiline
							maxLength={MAX_BIO_LENGTH}
							onSubmitEditing={() => {
								setFocus('newPassword');
							}}
							testID='profile-view-bio'
						/>
					) : null}
					<ControlledFormTextInput
						name='newPassword'
						control={control}
						editable={Accounts_AllowPasswordChange}
						inputStyle={[!Accounts_AllowPasswordChange && styles.disabled]}
						label={I18n.t('New_Password')}
						onSubmitEditing={() => {
							if (Accounts_CustomFields && Object.keys(customFields).length) {
								// @ts-ignore
								return this[Object.keys(customFields)[0]].focus();
							}
						}}
						secureTextEntry
						testID='profile-view-new-password'
					/>

					<CustomFields
						Accounts_CustomFields={Accounts_CustomFields}
						customFields={customFields}
						onCustomFieldChange={value => setCustomFields(value)}
					/>

					<Button
						title={I18n.t('Save_Changes')}
						type='primary'
						onPress={handleSubmit(submit)}
						disabled={!enableSaveChangesButton()}
						testID='profile-view-submit'
						loading={getValues().saving}
					/>
					<Button
						title={I18n.t('Logout_from_other_logged_in_locations')}
						type='secondary'
						onPress={logoutOtherLocations}
						testID='profile-view-logout-other-locations'
					/>
					{Accounts_AllowDeleteOwnAccount ? (
						<Button
							title={I18n.t('Delete_my_account')}
							type='secondary'
							styleText={{ color: colors.fontDanger }}
							onPress={deleteOwnAccount}
							testID='profile-view-delete-my-account'
						/>
					) : null}
				</ScrollView>
			</SafeAreaView>
		</KeyboardView>
	);
};

export default ProfileView;
