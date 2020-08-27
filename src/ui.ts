import { Game } from "./game"
import { Player } from "./player"
import { AdvancedDynamicTexture, Grid, Image, GUI3DManager, Button, Control, TextBlock, Ellipse } from "@babylonjs/gui"
import { Sound } from "@babylonjs/core/Audio"
import { DeviceType } from "@babylonjs/core/DeviceInput"
import { Scene } from "@babylonjs/core/scene"
import { VirtualJoystick } from "@babylonjs/core/Misc"
import { Vector3 } from "@babylonjs/core/Maths"

export class GameUI {
    private _game : Game;

    private _guiOverlayTexture: AdvancedDynamicTexture;

    private _confirmSound: Sound;
    private _cancelSound: Sound;

    /* Controls */
    /* start menu / main menu */
    private _startMenuControls: Control[] = [];
    private _mainMenuControls: Control[] = [];
    private _battleUiControls: Control[] = [];
    private _howToPlayControls: Control[] = [];
    private _creditsControls: Control[] = [];
    private _mainMenuButtonGrid: Grid;
    private _startScreenImage: Image;
    private _startScreenText: TextBlock;
    private _onePlayerButton: Button;
    private _twoPlayerButton: Button;
    private _howToPlayButton: Button;
    private _creditsButton: Button;
    private _player1ConnectivityInformationGrid: Grid;
    private _player1NameLabel: TextBlock;
    private _player1DeviceLabel: TextBlock;
    private _player2ConnectivityInformationGrid: Grid;
    private _player2NameLabel: TextBlock;
    private _player2DeviceLabel: TextBlock;

    /* battle ui */
    private _playerHealthBarGrid: Grid;
    private _player1HealthNameLabel: TextBlock;
    private _player1HealthBarBorder: Image;
    private _player1HealthBarBackground: Image;
    private _player1HealthBarFill: Image;
    private _player2HealthNameLabel: TextBlock;
    private _player2HealthBarBorder: Image;
    private _player2HealthBarBackground: Image;
    private _player2HealthBarFill: Image;
    private _gameOverImage : Image;

    /* credits */
    private _creditsMenuBackgroundImage : Image;
    private _creditsLabel: TextBlock;
    private _creditsBackButton: Button;

    /* sounds */
    private _selectSound : Sound;

    /* virtual joystick */
    private _touchJoystick : TouchScreenGamepad;


    private _noDeviceConnectedText: string = "Press Any Button To Join!";

    constructor (game: Game){
        this._game = game;
        this._guiOverlayTexture = AdvancedDynamicTexture.CreateFullscreenUI(
            "gameUIOverlay",
            true,
            this._game.gameScene
          );

        this.loadSounds();
        this.createStartMenu();
        this.createMainMenu();
        this.createBattleUI();
        this.createCreditsMenu();
        this.createHowToPlayMenu();
        this.hideGui();
    }

    private loadSounds(){
        this._selectSound = new Sound("MenuSelectSound", "./Sounds/8bitSlap.wav", this._game.gameScene);
    }

    public hideGui() {
        this._guiOverlayTexture.executeOnAllControls(control =>{
            /* don't hide the root container */
            if (control.parent != null){
                control.isVisible = false;
            }
        });
        if (this._touchJoystick){
            this.showControls(this._touchJoystick.controls)
        }
    }

    private showControls(controls: Control[]){
        controls.forEach((control) => {
            control.isVisible = true;
            control.getDescendants().forEach((descendant) => {
                descendant.isVisible = true;
            });
        });
    }

    public createStartMenu(){
        this._startScreenImage = new Image("StartScreenImage", "./Sprites/RooftopRampageTitle.png");
        this._startScreenText
        this._startMenuControls.push(this._startScreenImage);
        this._guiOverlayTexture.addControl(this._startScreenImage);
        this._startScreenText = new TextBlock("StartScreenText", "Press ANY BUTTON to start!");
        this._startScreenText.fontFamily = "PressStart2P";
        this._startScreenText.fontSize = 24;
        this._startScreenText.top = "30%";
        this._startScreenText.height = "25%";
        this._guiOverlayTexture.addControl(this._startScreenText);
        this._startMenuControls.push(this._startScreenText);
    }

    public showStartMenu(){
        this.hideGui();
        this.showControls(this._startMenuControls);
    }

    public createMainMenu(): void {
        /* One Player Button initialization */
        this._mainMenuControls.push(this._startScreenImage);
        this._mainMenuButtonGrid = new Grid("Grid_MainMenuButtons");
        this._mainMenuButtonGrid.top = "-1%"
        this._mainMenuButtonGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._mainMenuButtonGrid.height = 0.4;
        this._mainMenuButtonGrid.width = 1;
        this._mainMenuButtonGrid.fontFamily = "PressStart2P";
        this._mainMenuButtonGrid.addColumnDefinition(0.3);
        this._mainMenuButtonGrid.addColumnDefinition(0.033);
        this._mainMenuButtonGrid.addColumnDefinition(0.25);
        this._mainMenuButtonGrid.addColumnDefinition(0.033);
        this._mainMenuButtonGrid.addColumnDefinition(0.3);
        this._mainMenuButtonGrid.addRowDefinition(0.25);
        this._mainMenuButtonGrid.addRowDefinition(0.25);
        this._mainMenuButtonGrid.addRowDefinition(0.25);
        this._mainMenuButtonGrid.addRowDefinition(0.25);
        this._guiOverlayTexture.addControl(this._mainMenuButtonGrid);
        this._mainMenuControls.push(this._mainMenuButtonGrid);


        this._onePlayerButton = Button.CreateImageWithCenterTextButton("Button_OnePlayer",
                                                                          "One Player",
                                                                          "./Sprites/OnePlayerButton.png");
        this._onePlayerButton.paddingTop = 0;
        this._onePlayerButton.paddingBottom = 3;
        this._onePlayerButton.textBlock.paddingLeft = "5%";
        this._onePlayerButton.textBlock.fontSize = 14;
        this._onePlayerButton.textBlock.fontFamily = "PressStart2P";
        this._onePlayerButton.color = "transparent";
        this._onePlayerButton.textBlock.color = "black";
        this._onePlayerButton.onPointerClickObservable.add(() => {
            this._selectSound.play();
            this._game.startOnePlayer();
        });
        this._mainMenuButtonGrid.addControl(this._onePlayerButton, 0, 2);
        this._mainMenuControls.push(this._onePlayerButton);

        /* Two Players Button initialization */
        this._twoPlayerButton = Button.CreateImageWithCenterTextButton("Button_TwoPlayers",
                                                                        "Two Players",
                                                                        "./Sprites/TwoPlayerButton.png");
        this._twoPlayerButton.paddingTop = 0;
        this._twoPlayerButton.paddingBottom = 3;
        this._twoPlayerButton.textBlock.fontSize = 14;
        this._twoPlayerButton.textBlock.fontFamily = "PressStart2P";
        this._twoPlayerButton.color = "transparent";
        this._twoPlayerButton.textBlock.color = "black";
        this._twoPlayerButton.onPointerClickObservable.add(() => {
            this._selectSound.play();
            this._game.startTwoPlayer();
        });
        this._mainMenuButtonGrid.addControl(this._twoPlayerButton, 1, 2);
        this._mainMenuControls.push(this._twoPlayerButton);

        /* How To Play Button Initialization */
        this._howToPlayButton = Button.CreateImageWithCenterTextButton("Button_HowToPlay",
                                                                       "How To Play",
                                                                       "./Sprites/HowToPlayButton.png");
        this._howToPlayButton.paddingTop = 0;
        this._howToPlayButton.paddingBottom = 3;
        this._howToPlayButton.textBlock.fontSize = 14;
        this._howToPlayButton.textBlock.fontFamily = "PressStart2P";
        this._howToPlayButton.color = "transparent";
        this._howToPlayButton.textBlock.color = "black";
        this._howToPlayButton.onPointerClickObservable.add(() => {
            this._selectSound.play();
            this.showHowToPlayMenu();
        });
        //this._mainMenuButtonGrid.addControl(this._howToPlayButton, 2, 2);
        this._mainMenuControls.push(this._howToPlayButton);

        this._creditsButton = Button.CreateImageWithCenterTextButton("Button_Credits",
                                                                     "Credits",
                                                                     "./Sprites/CreditsButton.png");
        this._creditsButton.paddingTop = 0;
        this._creditsButton.paddingBottom = 3;
        this._creditsButton.textBlock.fontSize = 14;
        this._creditsButton.textBlock.fontFamily = "PressStart2P";
        this._creditsButton.color = "transparent";
        this._creditsButton.textBlock.color = "black";
        this._creditsButton.onPointerClickObservable.add(() => {
            this._selectSound.play();
            this.showCreditsMenu();
        });
        this._mainMenuButtonGrid.addControl(this._creditsButton, 3, 2);
        this._mainMenuControls.push(this._creditsButton);

        /* Player 1 connectivity info initialization */
        this._player1NameLabel = new TextBlock("Label_Player1Name",
                                                 "Player 1:");
        this._player1DeviceLabel = new TextBlock("Label_Player1Device",
                                                this._noDeviceConnectedText);

        this._player1NameLabel.fontSize = 16;
        this._player1NameLabel.fontFamily = "PressStart2P";
        this._mainMenuButtonGrid.addControl(this._player1NameLabel, 2, 0);
        this._mainMenuControls.push(this._player1NameLabel);

        this._player1DeviceLabel.fontSize = 10;
        this._player1DeviceLabel.fontFamily = "PressStart2P";
        this._mainMenuButtonGrid.addControl(this._player1DeviceLabel, 3, 0);
        this._mainMenuControls.push(this._player1DeviceLabel);

        /* Player 2 connectivity info initialization */
        this._player2NameLabel = new TextBlock("Label_Player2Name",
        "Player 2:");
        this._player2NameLabel.fontSize = 16;
        this._player2NameLabel.fontFamily = "PressStart2P";
        this._mainMenuButtonGrid.addControl(this._player2NameLabel, 2, 4);
        this._mainMenuControls.push(this._player2NameLabel);
        this._player2DeviceLabel = new TextBlock("Label_Player2Device",
        "<Press Button to Join!>");
        this._player2DeviceLabel.fontSize = 10;
        this._player2DeviceLabel.fontFamily = "PressStart2P";
        this._mainMenuButtonGrid.addControl(this._player2DeviceLabel, 3, 4);
        this._mainMenuControls.push(this._player2DeviceLabel);
    }

    public showMainMenu(): void {
        this.hideGui();
        this.showControls(this._mainMenuControls);
    }

    public createBattleUI(): void {
        /* create lifebars */
        /* create win screen */

        this._playerHealthBarGrid = new Grid("PlayerHealthBarGrid");
        this._guiOverlayTexture.addControl(this._playerHealthBarGrid);
        this._playerHealthBarGrid.addRowDefinition(0.05);
        this._playerHealthBarGrid.addRowDefinition(0.1);

        this._playerHealthBarGrid.addColumnDefinition(0.05);
        this._playerHealthBarGrid.addColumnDefinition(0.3);
        this._playerHealthBarGrid.addColumnDefinition(0.2);
        this._playerHealthBarGrid.addColumnDefinition(0.3);
        this._playerHealthBarGrid.addColumnDefinition(0.05);
        this._playerHealthBarGrid.width = "100%";
        this._playerHealthBarGrid.height = "15%";
        this._playerHealthBarGrid.top = 0;
        this._playerHealthBarGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

        this._player1HealthNameLabel = new TextBlock("Player1HealthBarName", "Player 1");
        this._playerHealthBarGrid.addControl(this._player1HealthNameLabel, 0, 1);
        this._player1HealthNameLabel.horizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
        this._player1HealthNameLabel.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM;
        this._player1HealthNameLabel.fontFamily = "PressStart2P";
        this._player1HealthNameLabel.fontSize = 14;

        this._player1HealthBarBorder = new Image("Player1HealthBarBorder", "./Sprites/LifeBar_Border_P1.png");
        this._player1HealthBarBorder.zIndex = 2;
        this._playerHealthBarGrid.addControl(this._player1HealthBarBorder, 1, 1);

        this._player1HealthBarBackground = new Image("Player1HealthBarBackground", "./Sprites/LifeBar_Background.png");
        this._player1HealthBarBackground.zIndex = 0;
        this._playerHealthBarGrid.addControl(this._player1HealthBarBackground, 1, 1);

        this._player1HealthBarFill = new Image("Player1HealthBarFill", "./Sprites/LifeBar_Fill_P1.png");
        this._player1HealthBarFill.zIndex = 1
        this._playerHealthBarGrid.addControl(this._player1HealthBarFill, 1, 1);


        this._player2HealthNameLabel = new TextBlock("Player2HealthBarName", "Player 2");
        this._playerHealthBarGrid.addControl(this._player2HealthNameLabel, 0, 3);
        this._player2HealthNameLabel.horizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_RIGHT;
        this._player2HealthNameLabel.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM;
        this._player2HealthNameLabel.fontFamily = "PressStart2P";
        this._player2HealthNameLabel.fontSize = 14;

        this._player2HealthBarBorder = new Image("Player2HealthBarBorder", "./Sprites/LifeBar_Border_P2.png");
        this._player2HealthBarBorder.zIndex = 2;
        this._playerHealthBarGrid.addControl(this._player2HealthBarBorder, 1, 3);

        this._player2HealthBarBackground = new Image("Player2HealthBarBackground", "./Sprites/LifeBar_Background.png");
        this._player2HealthBarBackground.zIndex = 0;
        this._playerHealthBarGrid.addControl(this._player2HealthBarBackground, 1, 3);

        this._player2HealthBarFill = new Image("Player2HealthBarFill", "./Sprites/LifeBar_Fill_P2.png");
        this._player2HealthBarFill.zIndex = 1
        this._playerHealthBarGrid.addControl(this._player2HealthBarFill, 1, 3);

        this._battleUiControls.push(this._playerHealthBarGrid,
            this._player1HealthNameLabel, this._player1HealthBarBorder, this._player1HealthBarFill, this._player1HealthBarBackground,
            this._player2HealthNameLabel, this._player2HealthBarBorder, this._player2HealthBarFill, this._player2HealthBarBackground);
    }

    public setPlayerHealthPercent(player: number, percentage: number){
        let layoutOffset = 100 - percentage * 100
        if(player === 0){
            layoutOffset = -layoutOffset;
            this._player1HealthBarFill.left = layoutOffset + "%";
        }else if(player === 1){
            this._player2HealthBarFill.left = layoutOffset + "%";
        }
    }

    public showBattleUi(): void {
        this.hideGui();
        this.showControls(this._battleUiControls);
    }

    private createHowToPlayMenu(): void {

    }

    private showHowToPlayMenu(): void {
        this.showControls(this._howToPlayControls);
    }

    private createCreditsMenu(): void {
        /* create background image */
        this._creditsMenuBackgroundImage = new Image("CreditsMenuBackground", "./Sprites/CreditsMenuBackground.png");
        this._guiOverlayTexture.addControl(this._creditsMenuBackgroundImage);
        this._creditsMenuBackgroundImage.zIndex = -1;

        this._creditsLabel = new TextBlock("CreditsTextLabel",
        "Programming - Nicholas \"Drigax\" Barlow \r\n\
         Character Design - Nicholas \"Drigax\" Barlow\r\n\
         Environment Design - Nicholas \"Drigax\" Barlow\r\n\
         A generally awesome person - Nicholas \"Drigax\" Barlow\r\n\r\n\
         Title Music - \"Street Fighter\" by MelziTrap\r\n\
                https://youtube.com/Melzi%20Trap\r\n\r\n\
         Battle Music - \"HIDDEN\" by Natsu Fuji\r\n\
                https://www.youtube.com/user/NatsuTheProducer\r\n\r\n\
         Sound Effects provided graciously by https://Sonniss.com - GDC Audio Bundles\r\n\
         Additional free Sound Effects provided by https://www.felsliyanstudios.com\r\n\
         Other free Sound Effects provided by Music & Sounds Effect Library\r\n\
                https://www.youtube.com/channel/UCb-iLJ2ifYw0mV8AaAa1fFA\r\n\r\n\
         HDR images provided by graciously by Andreas Mischok via HDRIhaven.com \r\n\
                https://hdrihaven.com/hdris/?a=Andreas%20Mischok\r\n\r\n\
         \"PressStart2P\" font provided by Cody \"CodeMan38\" Boisclair\r\n\
                via http://zone38.net/font/\r\n\r\n\
         And of course powered by the amazing Babylon.js web engine!");
        this._guiOverlayTexture.addControl(this._creditsLabel);
        this._creditsLabel.fontFamily = "PressStart2P";
        this._creditsLabel.fontSize = 12;
        this._creditsLabel.top = "0%";
        this._creditsLabel.left = "0%";
        this._creditsLabel.width = "80%";
        this._creditsLabel.height = "80%";

        this._creditsBackButton = Button.CreateImageOnlyButton("CreditsBackButton", "./Sprites/BackButton.png");
        this._creditsBackButton.width = "20%";
        this._creditsBackButton.height = "35%";
        this._creditsBackButton.top = "0%";
        this._creditsBackButton.left = "0%";
        this._creditsBackButton.color = "transparent";
        this._creditsBackButton.verticalAlignment = Image.VERTICAL_ALIGNMENT_TOP;
        this._creditsBackButton.horizontalAlignment = Image.HORIZONTAL_ALIGNMENT_LEFT;
        this._guiOverlayTexture.addControl(this._creditsBackButton);
        this._creditsBackButton.onPointerClickObservable.add((evt) => {
            this._selectSound.play();
            this.showMainMenu();
        });

        this._creditsControls.push(this._creditsMenuBackgroundImage);
        this._creditsControls.push(this._creditsLabel);
        this._creditsControls.push(this._creditsBackButton);

    }

    private showCreditsMenu(): void {
        this.hideGui();
        this.showControls(this._creditsControls);
    }

    public updatePlayerDevices(inMenu: boolean){
        if (this._game.players.length > 0){
            let player1Device = this._game.devices[0];
            this._player1DeviceLabel.text = DeviceType[player1Device.deviceType] + "/" + player1Device.deviceSlot;
            if (inMenu){
                this.showMainMenu();
            }
        }else {
            this.showStartMenu();
        }
        if (this._game.players.length > 1){
            let player2Device = this._game.devices[1];
            this._player2DeviceLabel.text = DeviceType[player2Device.deviceType] + "/" + player2Device.deviceSlot;
            this._twoPlayerButton.isEnabled = true;
        } else{
            this._twoPlayerButton.isEnabled = false;
        }
    }

    public createTouchJoystick(){
        this._touchJoystick = new TouchScreenGamepad(this._game.gameScene, this);
    }

    public removeTouchJoystick(){
        this._touchJoystick.controls.forEach((control) => {
            control.dispose();
        });
        this._touchJoystick = null;
    }

    public getGame(): Game {
        return this._game;
    }

    public getGuiOverlayTexture(): AdvancedDynamicTexture{
        return this._guiOverlayTexture;
    }

    get touchJoystick(): TouchScreenGamepad{
        return this._touchJoystick;
    }
}

class TouchScreenGamepad {
    public controls: Control[] = [];

    private _upButton: Button;
    private _downButton: Button;
    private _leftButton: Button;
    private _rightButton: Button;

    private _jumpButton: Button;
    private _lightAttackButton: Button;
    private _heavyAttackButton: Button;
    private _dashButton: Button;
    private _switchGunButton: Button;
    private _virtualJoystickRawInput: Vector3 = new Vector3();
    private _moveInput: Vector3 = new Vector3();
    private _joystickPuckIsDown: boolean;

    get moveInput(): Vector3 {
        return this._moveInput.copyFromFloats((this.leftInput? -1 : 0) + (this.rightInput ? 1 : 0),
                                              (this.upInput? 1 : 0) + (this.downInput ? -1 : 0),
                                              0);
    }

    public upInput: boolean;
    public downInput: boolean;
    public leftInput: boolean;
    public rightInput: boolean;
    public jumpInput: boolean;
    public lightAttackInput: boolean;
    public dashInput: boolean;
    public switchGunInput: boolean;
    public heavyAttackInput: boolean;

    constructor(scene: Scene, gameUI: GameUI){
        /* create virtual buttons */
        this._upButton = Button.CreateImageWithCenterTextButton("VirtualJoystickUpButton", "", "./Sprites/UpButton.png");
        this._upButton.top = "30%";
        this._upButton.left = "-30%";
        this._upButton.width = "5.625%";
        this._upButton.height = "10%";
        this._upButton.color = "transparent";
        this._upButton.onPointerDownObservable.add(() => {
            this.upInput = true;
        });
        this._upButton.onPointerUpObservable.add(() => {
            this.upInput = false;
        });
        /* create virtual buttons */
        this._downButton = Button.CreateImageWithCenterTextButton("VirtualJoystickDownButton", "", "./Sprites/DownButton.png");
        this._downButton.top = "45%";
        this._downButton.left = "-30%";
        this._downButton.width = "5.625%";
        this._downButton.height = "10%";
        this._downButton.color = "transparent";
        this._downButton.onPointerDownObservable.add(() => {
            this.downInput = true;
        });
        this._downButton.onPointerUpObservable.add(() => {
            this.downInput = false;
        });
        /* create virtual buttons */
        this._leftButton = Button.CreateImageWithCenterTextButton("VirtualJoystickLeftButton", "", "./Sprites/LeftButton.png");
        this._leftButton.top = "37.5%";
        this._leftButton.left = "-35%";
        this._leftButton.width = "8.4375%";
        this._leftButton.height = "15%";
        this._leftButton.color = "transparent";
        this._leftButton.onPointerDownObservable.add(() => {
            this.leftInput = true;
        });
        this._leftButton.onPointerUpObservable.add(() => {
            this.leftInput = false;
        });
        /* create virtual buttons */
        this._rightButton = Button.CreateImageWithCenterTextButton("VirtualJoystickRightButton", "", "./Sprites/RightButton.png");
        this._rightButton.top = "37.5%";
        this._rightButton.left = "-25%";
        this._rightButton.width = "8.4375%";
        this._rightButton.height = "15%";
        this._rightButton.color = "transparent";
        this._rightButton.onPointerDownObservable.add(() => {
            this.rightInput = true;
        });
        this._rightButton.onPointerUpObservable.add(() => {
            this.rightInput = false;
        });

        /* attack buttons */
        /* create virtual buttons */
        this._jumpButton = Button.CreateImageWithCenterTextButton("VirtualJoystickJumpButton", "", "./Sprites/JumpButton.png");
        this._jumpButton.top = "45%";
        this._jumpButton.left = "25%";
        this._jumpButton.width = "8.4375%";
        this._jumpButton.height = "15%";
        this._jumpButton.color = "transparent";
        this._jumpButton.onPointerDownObservable.add(() => {
            this.jumpInput = true;
        });
        this._jumpButton.onPointerUpObservable.add(() => {
            this.jumpInput = false;
        });

        this._lightAttackButton = Button.CreateImageWithCenterTextButton("VirtualJoystickLightAttackButton", "", "./Sprites/LightAttackButton.png");
        this._lightAttackButton.top = "30%";
        this._lightAttackButton.left = "25%";
        this._lightAttackButton.width = "8.4375%";
        this._lightAttackButton.height = "15%";
        this._lightAttackButton.color = "transparent";
        this._lightAttackButton.onPointerDownObservable.add(() => {
            this.lightAttackInput = true;
        });
        this._lightAttackButton.onPointerUpObservable.add(() => {
            this.lightAttackInput = false;
        });

        this._heavyAttackButton = Button.CreateImageWithCenterTextButton("VirtualJoystickHeavyAttackButton", "", "./Sprites/HeavyAttackButton.png");
        this._heavyAttackButton.top = "30%";
        this._heavyAttackButton.left = "35%";
        this._heavyAttackButton.width = "8.4375%";
        this._heavyAttackButton.height = "15%";
        this._heavyAttackButton.color = "transparent";
        this._heavyAttackButton.onPointerDownObservable.add(() => {
            this.heavyAttackInput = true;
        });
        this._heavyAttackButton.onPointerUpObservable.add(() => {
            this.heavyAttackInput = false;
        });

        this._dashButton = Button.CreateImageWithCenterTextButton("VirtualJoystickDashButton", "", "./Sprites/DashButton.png");
        this._dashButton.top = "45%";
        this._dashButton.left = "35%";
        this._dashButton.width = "8.4375%";
        this._dashButton.height = "15%";
        this._dashButton.color = "transparent";
        this._dashButton.onPointerDownObservable.add(() => {
            this.dashInput = true;
        });
        this._dashButton.onPointerUpObservable.add(() => {
            this.dashInput = false;
        });

        this._switchGunButton = Button.CreateImageWithCenterTextButton("VirtualJoystickSwitchGunButton", "", "./Sprites/SwitchGunButton.png");
        this._switchGunButton.top = "37.5%";
        this._switchGunButton.left = "45%";
        this._switchGunButton.width = "8.4375%";
        this._switchGunButton.height = "15%";
        this._switchGunButton.color = "transparent";
        this._switchGunButton.onPointerDownObservable.add(() => {
            this.switchGunInput = true;
        });
        this._switchGunButton.onPointerUpObservable.add(() => {
            this.switchGunInput = false;
        });

        gameUI.getGuiOverlayTexture().addControl(this._upButton);
        gameUI.getGuiOverlayTexture().addControl(this._downButton);
        gameUI.getGuiOverlayTexture().addControl(this._leftButton);
        gameUI.getGuiOverlayTexture().addControl(this._rightButton);
        gameUI.getGuiOverlayTexture().addControl(this._jumpButton);
        gameUI.getGuiOverlayTexture().addControl(this._lightAttackButton);
        gameUI.getGuiOverlayTexture().addControl(this._heavyAttackButton);
        gameUI.getGuiOverlayTexture().addControl(this._dashButton);
        gameUI.getGuiOverlayTexture().addControl(this._switchGunButton);
        this.controls.push(this._jumpButton);
        this.controls.push(this._lightAttackButton);
        this.controls.push(this._heavyAttackButton);
        this.controls.push(this._dashButton);
        this.controls.push(this._switchGunButton);
        this.controls.push(this._upButton);
        this.controls.push(this._downButton);
        this.controls.push(this._leftButton);
        this.controls.push(this._rightButton);
    }
}