package com.sonora.musicplayer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeFolderPickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
