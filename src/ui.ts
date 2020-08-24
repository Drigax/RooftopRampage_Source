import { Game } from "./game"
import { Player } from "./player"
import { AdvancedDynamicTexture, Grid, Image, GUI3DManager, Button, Control, TextBlock } from "@babylonjs/gui"

export class GameUI {
    private _game : Game;

    private _guiOverlayTexture: AdvancedDynamicTexture;
    private _playerHealthMeters: PlayerHealthMeter[] = [];
    private _playerAmmoMeters: PlayerAmmoMeter[] = [];

    /* Controls */
    /* start screen / main screen */
    private _mainMenuButtonGrid: Grid;
    private _startScreenImage: Image;
    private _singlePlayerButton: Button;
    private _twoPlayersButton: Button;
    private _howToPlayButton: Button;
    private _player1ConnectivityInformationGrid: Grid;
    private _player1NameLabel: TextBlock;
    private _player1DeviceLabel: TextBlock;
    private _player2ConnectivityInformationGrid: Grid;
    private _player2NameLabel: TextBlock;
    private _player2DeviceLabel: TextBlock;

    constructor (game: Game){
        this._game = game;
        this.initializeHealthMeters();
        this.initializeAmmoMeters();

        this._guiOverlayTexture = AdvancedDynamicTexture.CreateFullscreenUI(
            "gameUIOverlay",
            true,
            this._game.gameScene
          );
        this.createStartMenu();
        this.createMainMenu();
        this.hideGui();

    }

    private clearGui() {
        this._guiOverlayTexture.executeOnAllControls(control =>{
            control.dispose();
        });
    }

    public hideGui() {
        this._guiOverlayTexture.executeOnAllControls(control =>{
            /* don't hide the root container */
            if (control.parent != null){
                control.isVisible = false;
            }
        });
    }

    public createStartMenu(){
        this._startScreenImage = new Image("StartScreenImage", "./Sprites/RooftopRampageTitle.png");
        this._guiOverlayTexture.addControl(this._startScreenImage);
    }

    public showStartMenu(){
        this.hideGui();
        this._startScreenImage.isVisible = true;
    }

    public createMainMenu(): void {
        /* One Player Button initialization */
        this._mainMenuButtonGrid = new Grid("Grid_MainMenuButtons");
        this._mainMenuButtonGrid.top = "-1%"
        this._mainMenuButtonGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._mainMenuButtonGrid.height = 0.4;
        this._mainMenuButtonGrid.width = 1;
        this._mainMenuButtonGrid.fontFamily = "PressStart2P";
        this._mainMenuButtonGrid.addColumnDefinition(0.25);
        this._mainMenuButtonGrid.addColumnDefinition(0.083);
        this._mainMenuButtonGrid.addColumnDefinition(0.333);
        this._mainMenuButtonGrid.addColumnDefinition(0.083);
        this._mainMenuButtonGrid.addColumnDefinition(0.25);
        this._mainMenuButtonGrid.addRowDefinition(0.333);
        this._mainMenuButtonGrid.addRowDefinition(0.333);
        this._mainMenuButtonGrid.addRowDefinition(0.333);
        this._guiOverlayTexture.addControl(this._mainMenuButtonGrid);


        this._singlePlayerButton = Button.CreateImageWithCenterTextButton("Button_SinglePlayer",
                                                                          "Single Player",
                                                                          "./Sprites/SinglePlayerButton");
        this._singlePlayerButton.paddingTop = 0;
        this._singlePlayerButton.paddingBottom = 3;
        this._mainMenuButtonGrid.addControl(this._singlePlayerButton, 0, 2);

        /* Two Players Button initialization */
        this._twoPlayersButton = Button.CreateImageWithCenterTextButton("Button_TwoPlayers",
                                                                        "Two Players",
                                                                        "./Sprites/TwoPlayerButton");
        this._twoPlayersButton.paddingTop = 0;
        this._twoPlayersButton.paddingBottom = 3;
        this._mainMenuButtonGrid.addControl(this._twoPlayersButton, 1, 2);

        /* How To Play Button Initialization */
        this._howToPlayButton = Button.CreateImageWithCenterTextButton("Button_HowToPlay",
                                                                       "How To Play",
                                                                       "./Sprites/HowToPlayButton");
        this._howToPlayButton.paddingTop = 0;
        this._howToPlayButton.paddingBottom = 3;
        this._mainMenuButtonGrid.addControl(this._howToPlayButton, 2, 2);

        /* Player 1 connectivity info initialization */
        this._player1ConnectivityInformationGrid = new Grid("Grid_Player1Connetivity");
        this._player1ConnectivityInformationGrid.addColumnDefinition(1);
        this._player1ConnectivityInformationGrid.addRowDefinition(0.666);
        this._player1ConnectivityInformationGrid.addRowDefinition(0.333);
        this._player1NameLabel = new TextBlock("Label_Player1Name",
                                                 "Player 1:");
        this._player1DeviceLabel = new TextBlock("Label_Player1Device",
                                                "<Press Any Button To Join!>");
        this._player1DeviceLabel.top = "-1%";
        this._player1DeviceLabel.left= "1%";
        this._player1DeviceLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._player1DeviceLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._player1DeviceLabel.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._player1DeviceLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._mainMenuButtonGrid.addControl(this._player1ConnectivityInformationGrid, 2, 0);

        /* Player 2 connectivity info initialization */
        this._player2ConnectivityInformationGrid = new Grid("Grid_Player2Connetivity");
        this._player2ConnectivityInformationGrid.addColumnDefinition(1);
        this._player2ConnectivityInformationGrid.addRowDefinition(0.666);
        this._player2ConnectivityInformationGrid.addRowDefinition(0.333);
        this._player2DeviceLabel = new TextBlock("Label_Player2Device",
        "<Press Button to Join!>");
        this._player2NameLabel = new TextBlock("Label_Player2Name",
        "Player 2:");
        this._player2DeviceLabel.top = "-1%";
        this._player2DeviceLabel.left= "1%";
        this._player2DeviceLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this._player2DeviceLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this._player2DeviceLabel.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._player2DeviceLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._mainMenuButtonGrid.addControl(this._player2DeviceLabel, 2, 4);
    }

    public showMainMenu(): void {
        this.hideGui();
        this._mainMenuButtonGrid.isVisible = true;
        this._startScreenImage.isVisible = true;
        this._singlePlayerButton.isVisible = true;
        this._twoPlayersButton.isVisible = true;
        this._howToPlayButton.isVisible = true;
        this._player1DeviceLabel.isVisible = true;
        this._player2DeviceLabel.isVisible = true;
    }

    private initializeHealthMeters(): void {

    }

    private initializeAmmoMeters(): void{

    }

    private initializeMainMenu(): void{

    }
}

class PlayerHealthMeter {
    private _value: number;
    private _currentValue: number;

    private _player: Player;
    constructor(player: Player){
        this._player = player;
    }
}

class PlayerAmmoMeter {
    private _value: number;
    private _currentValue: number;

    private _player: Player;
    constructor(player: Player){
        this._player = player;
    }
}